import 'package:flutter/material.dart';

/// "Night cockpit" palette, matching the Floot web UI.
class CopilotoColors {
  static const background = Color(0xFF0B0F16);
  static const surface = Color(0xFF131A24);
  static const card = Color(0xFF18202C);
  static const border = Color(0xFF2A3341);
  static const primary = Color(0xFF2EE6F6);
  static const onPrimary = Color(0xFF071318);
  static const muted = Color(0xFF9AA6B5);
  static const warning = Color(0xFFFFB224);
  static const success = Color(0xFF3CCB86);
}

ThemeData buildTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: CopilotoColors.primary,
    brightness: Brightness.dark,
  ).copyWith(
    primary: CopilotoColors.primary,
    onPrimary: CopilotoColors.onPrimary,
    surface: CopilotoColors.background,
    surfaceContainer: CopilotoColors.surface,
    outline: CopilotoColors.border,
  );
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: CopilotoColors.background,
    textTheme: const TextTheme(
      headlineMedium: TextStyle(fontSize: 30, fontWeight: FontWeight.w700, height: 1.2),
      titleLarge: TextStyle(fontSize: 22, fontWeight: FontWeight.w700),
      bodyLarge: TextStyle(fontSize: 18, height: 1.35),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size(64, 64),
        textStyle: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      ),
    ),
  );
}
