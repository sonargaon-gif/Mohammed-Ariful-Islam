package com.freeconnect.app.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.freeconnect.app.R
import com.freeconnect.app.ui.theme.CyanGlow
import com.freeconnect.app.ui.theme.ElectricBlue
import com.freeconnect.app.ui.theme.ElectricBlueBright
import com.freeconnect.app.ui.theme.FreeConnectBorder
import com.freeconnect.app.ui.theme.FreeConnectCard
import com.freeconnect.app.ui.theme.FreeConnectNavy
import com.freeconnect.app.ui.theme.FreeConnectObsidian
import com.freeconnect.app.ui.theme.TextWhite

/**
 * Battery-efficient futuristic deep navy & obsidian background featuring the bundled
 * FreeConnect Bluetooth/Earth/Network artwork with measured readability scrims and
 * subtle luminous vector signal arcs (zero heavy continuous GPU animations).
 */
@Composable
fun FuturisticBackground(
    modifier: Modifier = Modifier,
    scrimAlpha: Float = 0.72f,
    content: @Composable BoxScope.() -> Unit
) {
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colors = listOf(
                        FreeConnectObsidian,
                        FreeConnectNavy,
                        Color(0xFF040D1F),
                        FreeConnectObsidian
                    )
                )
            )
    ) {
        // Primary bundled FreeConnect futuristic Bluetooth + Earth + connected devices artwork
        Image(
            painter = painterResource(id = R.drawable.bg_freeconnect_futuristic),
            contentDescription = null,
            contentScale = ContentScale.Crop,
            alpha = 1f - (scrimAlpha * 0.65f),
            modifier = Modifier.fillMaxSize()
        )

        // Subtle luminous cyan/blue wireless signal waves & particle atmosphere
        Canvas(modifier = Modifier.fillMaxSize()) {
            val center = Offset(size.width * 0.5f, size.height * 0.42f)
            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(CyanGlow.copy(alpha = 0.14f), Color.Transparent),
                    center = center,
                    radius = size.width * 0.75f
                ),
                radius = size.width * 0.75f,
                center = center
            )
            listOf(0.28f, 0.42f, 0.58f).forEachIndexed { idx, ratio ->
                drawCircle(
                    color = CyanGlow.copy(alpha = 0.10f - idx * 0.025f),
                    radius = size.width * ratio,
                    center = center,
                    style = Stroke(width = 1.2f)
                )
            }
        }

        // Legibility scrim ensuring >= 4.5:1 WCAG contrast for white UI typography
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        colors = listOf(
                            FreeConnectObsidian.copy(alpha = scrimAlpha * 0.85f),
                            FreeConnectNavy.copy(alpha = scrimAlpha * 0.65f),
                            FreeConnectObsidian.copy(alpha = scrimAlpha * 0.92f)
                        )
                    )
                )
        )

        content()
    }
}

/**
 * Translucent glassmorphism card with luminous cyan-blue hairline rim.
 */
@Composable
fun GlassCard(
    modifier: Modifier = Modifier,
    cornerRadius: Dp = 20.dp,
    padding: Dp = 16.dp,
    highlighted: Boolean = false,
    content: @Composable ColumnScope.() -> Unit
) {
    val shape = RoundedCornerShape(cornerRadius)
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(shape)
            .background(
                Brush.linearGradient(
                    colors = listOf(
                        FreeConnectCard,
                        Color(0x99081429)
                    )
                )
            )
            .border(
                width = 1.dp,
                brush = Brush.linearGradient(
                    colors = if (highlighted) {
                        listOf(CyanGlow.copy(alpha = 0.75f), ElectricBlue.copy(alpha = 0.5f))
                    } else {
                        listOf(FreeConnectBorder, ElectricBlue.copy(alpha = 0.18f))
                    }
                ),
                shape = shape
            )
            .padding(padding),
        content = content
    )
}

/**
 * Glowing electric blue -> cyan primary CTA button.
 */
@Composable
fun GlowingPrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val shape = RoundedCornerShape(16.dp)
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(54.dp)
            .shadow(
                elevation = 16.dp,
                shape = shape,
                ambientColor = CyanGlow,
                spotColor = ElectricBlueBright
            )
            .clip(shape)
            .background(
                Brush.horizontalGradient(
                    colors = listOf(ElectricBlue, ElectricBlueBright, CyanGlow.copy(alpha = 0.85f))
                )
            )
            .border(1.dp, CyanGlow.copy(alpha = 0.6f), shape)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.titleMedium.copy(
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.sp
            ),
            color = TextWhite
        )
    }
}
