package com.freeconnect.app.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// Futuristic FreeConnect Palette — Deep Navy, Black, Electric Blue & Cyan Highlights
val FreeConnectObsidian = Color(0xFF030814)
val FreeConnectNavy = Color(0xFF061226)
val FreeConnectSurface = Color(0xCC0B1A33)       // Translucent glass surface
val FreeConnectCard = Color(0xB30E203E)          // Glassmorphism card fill
val FreeConnectBorder = Color(0x4D38BDF8)        // Subtle cyan-blue glass rim
val FreeConnectBorderMuted = Color(0x3360A5FA)
val ElectricBlue = Color(0xFF2563EB)
val ElectricBlueBright = Color(0xFF3B82F6)
val CyanGlow = Color(0xFF22D3EE)
val SignalGreen = Color(0xFF10B981)
val WarningAmber = Color(0xFFF59E0B)
val ErrorCrimson = Color(0xFFEF4444)
val TextWhite = Color(0xFFF8FAFC)
val TextMuted = Color(0xFF94A3B8)

private val FreeConnectDarkScheme = darkColorScheme(
    primary = ElectricBlue,
    onPrimary = Color.White,
    primaryContainer = Color(0xFF1D4ED8),
    onPrimaryContainer = Color(0xFFDBEAFE),
    secondary = CyanGlow,
    onSecondary = FreeConnectObsidian,
    background = FreeConnectObsidian,
    onBackground = TextWhite,
    surface = FreeConnectNavy,
    onSurface = TextWhite,
    surfaceVariant = FreeConnectCard,
    onSurfaceVariant = TextMuted,
    outline = FreeConnectBorder,
    error = ErrorCrimson,
    onError = Color.White
)

private val FreeConnectTypography = Typography(
    displaySmall = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.ExtraBold,
        fontSize = 32.sp,
        lineHeight = 38.sp,
        letterSpacing = 2.sp,
        color = TextWhite
    ),
    headlineLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Bold,
        fontSize = 26.sp,
        lineHeight = 32.sp,
        color = TextWhite
    ),
    headlineMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 20.sp,
        lineHeight = 26.sp,
        color = TextWhite
    ),
    titleMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 15.sp,
        lineHeight = 21.sp,
        color = TextWhite
    ),
    bodyLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 15.sp,
        lineHeight = 22.sp,
        color = TextWhite
    ),
    bodyMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 13.sp,
        lineHeight = 19.sp,
        color = TextMuted
    ),
    labelMedium = TextStyle(
        fontFamily = FontFamily.Monospace,
        fontWeight = FontWeight.Medium,
        fontSize = 11.sp,
        lineHeight = 16.sp,
        color = TextMuted
    )
)

private val FreeConnectShapes = Shapes(
    small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(18.dp),
    large = RoundedCornerShape(24.dp)
)

@Composable
fun FreeConnectTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = FreeConnectDarkScheme,
        typography = FreeConnectTypography,
        shapes = FreeConnectShapes,
        content = content
    )
}
