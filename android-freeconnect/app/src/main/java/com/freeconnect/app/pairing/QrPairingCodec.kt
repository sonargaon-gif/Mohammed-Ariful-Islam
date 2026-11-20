package com.freeconnect.app.pairing

import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter

/**
 * Offline QR Code Pairing Codec for FreeConnect.
 * Encodes local Bluetooth MAC, FreeConnect Node ID, Display Name, and ECDH P-256 Public Key
 * into a scannable QR code so two phones can pair and verify cryptographic identity offline.
 */
object QrPairingCodec {

    data class PairingPayload(
        val nodeId: String,
        val displayName: String,
        val bluetoothAddress: String,
        val publicKeyBase64: String
    )

    fun encodeUri(payload: PairingPayload): String {
        return Uri.Builder()
            .scheme("freeconnect")
            .authority("pair")
            .appendQueryParameter("node", payload.nodeId)
            .appendQueryParameter("name", payload.displayName)
            .appendQueryParameter("mac", payload.bluetoothAddress)
            .appendQueryParameter("pub", payload.publicKeyBase64)
            .build()
            .toString()
    }

    fun decodeUri(raw: String): PairingPayload? {
        return try {
            val uri = Uri.parse(raw)
            if (uri.scheme != "freeconnect" || uri.host != "pair") return null
            val node = uri.getQueryParameter("node") ?: return null
            val name = uri.getQueryParameter("name") ?: "FreeConnect Peer"
            val mac = uri.getQueryParameter("mac") ?: return null
            val pub = uri.getQueryParameter("pub") ?: return null
            PairingPayload(node, name, mac, pub)
        } catch (_: Exception) {
            null
        }
    }

    fun generateQrBitmap(content: String, sizePx: Int = 512): Bitmap {
        val bitMatrix = QRCodeWriter().encode(content, BarcodeFormat.QR_CODE, sizePx, sizePx)
        val bitmap = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
        for (x in 0 until sizePx) {
            for (y in 0 until sizePx) {
                bitmap.setPixel(
                    x,
                    y,
                    if (bitMatrix[x, y]) Color.parseColor("#030814") else Color.parseColor("#F8FAFC")
                )
            }
        }
        return bitmap
    }
}
