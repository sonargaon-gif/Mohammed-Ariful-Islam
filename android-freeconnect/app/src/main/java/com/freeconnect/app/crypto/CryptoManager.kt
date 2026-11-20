package com.freeconnect.app.crypto

import android.content.Context
import android.util.Base64
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import java.nio.ByteBuffer
import java.security.KeyFactory
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.MessageDigest
import java.security.PrivateKey
import java.security.PublicKey
import java.security.SecureRandom
import java.security.Signature
import java.security.spec.ECGenParameterSpec
import java.security.spec.PKCS8EncodedKeySpec
import java.security.spec.X509EncodedKeySpec
import javax.crypto.Cipher
import javax.crypto.KeyAgreement
import javax.crypto.Mac
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * End-to-End Encryption & Device Authentication Manager for FreeConnect.
 *
 * Cryptographic primitives:
 * - Identity & Key Agreement: Elliptic Curve P-256 (secp256r1) via ECDH
 * - Key Derivation: HKDF-SHA256 (RFC 5869) producing 256-bit AES session keys
 * - Authenticated Encryption: AES-256-GCM with 96-bit random IV and 128-bit auth tag
 * - Device Authentication: ECDSA-SHA256 challenge-response signatures on handshake
 * - Local Storage: EncryptedSharedPreferences backed by Android Keystore MasterKey
 *
 * Relay nodes forward [EncryptedPayload] verbatim without possessing the peer shared secret,
 * guaranteeing private messages cannot be read by intermediate relay phones.
 */
class CryptoManager(context: Context) {

    data class EncryptedPayload(
        val ciphertextBase64: String,
        val ivBase64: String
    )

    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val securePrefs = EncryptedSharedPreferences.create(
        context,
        PREFS_NAME,
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    private val secureRandom = SecureRandom()

    @Volatile
    private var cachedKeyPair: KeyPair? = null

    fun getOrCreateIdentityKeyPair(): KeyPair {
        cachedKeyPair?.let { return it }
        synchronized(this) {
            cachedKeyPair?.let { return it }
            val storedPub = securePrefs.getString(KEY_PUBLIC, null)
            val storedPriv = securePrefs.getString(KEY_PRIVATE, null)

            if (storedPub != null && storedPriv != null) {
                val keyFactory = KeyFactory.getInstance("EC")
                val pub = keyFactory.generatePublic(
                    X509EncodedKeySpec(Base64.decode(storedPub, Base64.NO_WRAP))
                )
                val priv = keyFactory.generatePrivate(
                    PKCS8EncodedKeySpec(Base64.decode(storedPriv, Base64.NO_WRAP))
                )
                return KeyPair(pub, priv).also { cachedKeyPair = it }
            }

            return regenerateIdentityKeyPair()
        }
    }

    fun regenerateIdentityKeyPair(): KeyPair {
        val generator = KeyPairGenerator.getInstance("EC")
        generator.initialize(ECGenParameterSpec("secp256r1"), secureRandom)
        val kp = generator.generateKeyPair()

        val pubB64 = Base64.encodeToString(kp.public.encoded, Base64.NO_WRAP)
        val privB64 = Base64.encodeToString(kp.private.encoded, Base64.NO_WRAP)
        val nodeId = deriveNodeId(kp.public.encoded)

        securePrefs.edit()
            .putString(KEY_PUBLIC, pubB64)
            .putString(KEY_PRIVATE, privB64)
            .putString(KEY_NODE_ID, nodeId)
            .apply()

        cachedKeyPair = kp
        return kp
    }

    fun getLocalNodeId(): String {
        val existing = securePrefs.getString(KEY_NODE_ID, null)
        if (!existing.isNullOrBlank()) return existing
        val kp = getOrCreateIdentityKeyPair()
        return deriveNodeId(kp.public.encoded).also {
            securePrefs.edit().putString(KEY_NODE_ID, it).apply()
        }
    }

    fun getPublicKeyBase64(): String {
        return Base64.encodeToString(getOrCreateIdentityKeyPair().public.encoded, Base64.NO_WRAP)
    }

    /**
     * Human-verifiable 16-character SHA-256 fingerprint for out-of-band verification
     * between two connected peers (Safety Number).
     */
    fun computeSafetyNumber(peerPublicKeyBase64: String): String {
        val localPub = getOrCreateIdentityKeyPair().public.encoded
        val remotePub = Base64.decode(peerPublicKeyBase64, Base64.NO_WRAP)

        // Sort lexicographically so both peers compute the exact same Safety Number
        val first: ByteArray
        val second: ByteArray
        if (compareByteArrays(localPub, remotePub) <= 0) {
            first = localPub
            second = remotePub
        } else {
            first = remotePub
            second = localPub
        }

        val digest = MessageDigest.getInstance("SHA-256").apply {
            update(first)
            update(second)
        }.digest()

        return digest.take(8)
            .joinToString("") { "%02X".format(it) }
            .chunked(4)
            .joinToString(" ")
    }

    fun getLocalFingerprint(): String {
        val digest = MessageDigest.getInstance("SHA-256")
            .digest(getOrCreateIdentityKeyPair().public.encoded)
        return digest.take(8)
            .joinToString("") { "%02X".format(it) }
            .chunked(4)
            .joinToString(" ")
    }

    /**
     * Signs a handshake payload using our EC private key so peers can authenticate our device.
     */
    fun signHandshake(nodeId: String, timestamp: Long, nonceBase64: String): String {
        val data = "$nodeId|$timestamp|$nonceBase64".toByteArray(Charsets.UTF_8)
        val sig = Signature.getInstance("SHA256withECDSA")
        sig.initSign(getOrCreateIdentityKeyPair().private, secureRandom)
        sig.update(data)
        return Base64.encodeToString(sig.sign(), Base64.NO_WRAP)
    }

    /**
     * Verifies an incoming peer handshake signature against their claimed public key.
     */
    fun verifyHandshake(
        peerNodeId: String,
        peerPublicKeyBase64: String,
        timestamp: Long,
        nonceBase64: String,
        signatureBase64: String
    ): Boolean {
        return try {
            val pubBytes = Base64.decode(peerPublicKeyBase64, Base64.NO_WRAP)
            // Ensure claimed nodeId matches SHA-256 of the presented public key
            if (deriveNodeId(pubBytes) != peerNodeId) return false

            val pubKey = KeyFactory.getInstance("EC").generatePublic(X509EncodedKeySpec(pubBytes))
            val data = "$peerNodeId|$timestamp|$nonceBase64".toByteArray(Charsets.UTF_8)
            val sig = Signature.getInstance("SHA256withECDSA")
            sig.initVerify(pubKey)
            sig.update(data)
            sig.verify(Base64.decode(signatureBase64, Base64.NO_WRAP))
        } catch (_: Exception) {
            false
        }
    }

    fun generateNonceBase64(): String {
        val bytes = ByteArray(16)
        secureRandom.nextBytes(bytes)
        return Base64.encodeToString(bytes, Base64.NO_WRAP)
    }

    /**
     * Encrypts plaintext for a specific recipient using ECDH(localPriv, recipientPub) -> HKDF -> AES-256-GCM.
     * Binds [associatedData] (packetId + senderId + recipientId) as GCM AAD to prevent header tampering.
     */
    fun encryptForPeer(
        plaintext: String,
        peerPublicKeyBase64: String,
        associatedData: String
    ): EncryptedPayload {
        val aesKey = deriveSharedAesKey(peerPublicKeyBase64)
        val iv = ByteArray(GCM_IV_LENGTH_BYTES)
        secureRandom.nextBytes(iv)

        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, aesKey, GCMParameterSpec(GCM_TAG_LENGTH_BITS, iv))
        cipher.updateAAD(associatedData.toByteArray(Charsets.UTF_8))

        val ciphertext = cipher.doFinal(plaintext.toByteArray(Charsets.UTF_8))
        return EncryptedPayload(
            ciphertextBase64 = Base64.encodeToString(ciphertext, Base64.NO_WRAP),
            ivBase64 = Base64.encodeToString(iv, Base64.NO_WRAP)
        )
    }

    /**
     * Decrypts an encrypted payload sent by [peerPublicKeyBase64].
     * Fails immediately with AEADBadTagException if tampered or decrypted by a non-recipient relay node.
     */
    fun decryptFromPeer(
        ciphertextBase64: String,
        ivBase64: String,
        peerPublicKeyBase64: String,
        associatedData: String
    ): String {
        val aesKey = deriveSharedAesKey(peerPublicKeyBase64)
        val iv = Base64.decode(ivBase64, Base64.NO_WRAP)
        val ciphertext = Base64.decode(ciphertextBase64, Base64.NO_WRAP)

        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, aesKey, GCMParameterSpec(GCM_TAG_LENGTH_BITS, iv))
        cipher.updateAAD(associatedData.toByteArray(Charsets.UTF_8))

        val plaintextBytes = cipher.doFinal(ciphertext)
        return String(plaintextBytes, Charsets.UTF_8)
    }

    private fun deriveSharedAesKey(peerPublicKeyBase64: String): SecretKeySpec {
        val localPriv: PrivateKey = getOrCreateIdentityKeyPair().private
        val remotePub: PublicKey = KeyFactory.getInstance("EC")
            .generatePublic(X509EncodedKeySpec(Base64.decode(peerPublicKeyBase64, Base64.NO_WRAP)))

        val agreement = KeyAgreement.getInstance("ECDH")
        agreement.init(localPriv)
        agreement.doPhase(remotePub, true)
        val sharedSecret = agreement.generateSecret()

        val derivedKey = hkdfSha256(
            ikm = sharedSecret,
            salt = "FreeConnect-v1-Salt".toByteArray(Charsets.UTF_8),
            info = "FreeConnect-AES256-GCM".toByteArray(Charsets.UTF_8),
            outputLength = 32
        )
        return SecretKeySpec(derivedKey, "AES")
    }

    private fun hkdfSha256(
        ikm: ByteArray,
        salt: ByteArray,
        info: ByteArray,
        outputLength: Int
    ): ByteArray {
        val hmac = Mac.getInstance("HmacSHA256")
        hmac.init(SecretKeySpec(salt, "HmacSHA256"))
        val prk = hmac.doFinal(ikm)

        hmac.init(SecretKeySpec(prk, "HmacSHA256"))
        val result = ByteBuffer.allocate(outputLength)
        var t = ByteArray(0)
        var counter = 1
        while (result.hasRemaining()) {
            hmac.reset()
            hmac.update(t)
            hmac.update(info)
            hmac.update(counter.toByte())
            t = hmac.doFinal()
            val toCopy = minOf(t.size, result.remaining())
            result.put(t, 0, toCopy)
            counter++
        }
        return result.array()
    }

    private fun deriveNodeId(publicKeyBytes: ByteArray): String {
        val hash = MessageDigest.getInstance("SHA-256").digest(publicKeyBytes)
        return "FC-" + hash.take(6).joinToString("") { "%02X".format(it) }
    }

    private fun compareByteArrays(a: ByteArray, b: ByteArray): Int {
        val len = minOf(a.size, b.size)
        for (i in 0 until len) {
            val diff = (a[i].toInt() and 0xFF) - (b[i].toInt() and 0xFF)
            if (diff != 0) return diff
        }
        return a.size - b.size
    }

    companion object {
        private const val PREFS_NAME = "freeconnect_secure_identity"
        private const val KEY_PUBLIC = "ec_public_key"
        private const val KEY_PRIVATE = "ec_private_key"
        private const val KEY_NODE_ID = "local_node_id"
        private const val GCM_IV_LENGTH_BYTES = 12
        private const val GCM_TAG_LENGTH_BITS = 128
    }
}
