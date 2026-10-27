import 'package:flutter/material.dart';

/// Design tokens shared with the web app (packages/shared).
///
/// NOTE ON THE BRIEF: Section 11 originally specified "navy + one accent (emerald)…
/// should feel like a bank app, not a classifieds site". The owner overrode that on
/// 2026-09-16 in favour of dubizzle.com.eg, then the same day asked for a mix of
/// nawy.com and dubizzle and chose "navy structure + red actions".
///
///   NAVY (#1E4164, sampled from nawy.com) carries structure — app bar, headings,
///        labels. It is never a call to action.
///   RED  (#E00000, sampled from dubizzle.com.eg) carries action and the commission
///        promise — filled buttons, emphasis badges.
///
/// Keep this in step with packages/shared/design-tokens.json; the drift guard
/// (`node packages/shared/check-tokens.mjs`) fails the build otherwise.
class AqarColors {
  // PALETTE (owner, 2026-10-11): "Forest & Flame", inverted, minimal (Apple-like).
  // Names are kept so every call site keeps working:
  //   brand  = action    = FOREST — outlined buttons, links.
  //   navy   = structure = INK and soft greys — headings, chrome is white.
  //   accent = identity  = RUST — logo, selected tabs, sliders, "Verified".
  //   danger = errors    — red is no longer an action colour.

  /// Action: forest.
  static const brand500 = Color(0xFF0F3D2E);
  static const brand600 = Color(0xFF0B2F23);
  static const brand100 = Color(0xFFD6E5DE);
  static const brand50 = Color(0xFFEEF4F1);

  /// Structure: ink and soft greys (was navy).
  static const navy900 = Color(0xFF1D1D1F);
  static const navy700 = Color(0xFF1D1D1F);
  static const navy500 = Color(0xFF424245);
  static const navy300 = Color(0xFF86868B);
  static const navy100 = Color(0xFFE8E8ED);
  static const navy50 = Color(0xFFF5F5F7);

  /// Identity: rust.
  static const accent500 = Color(0xFFC24418);
  static const accent600 = Color(0xFFA83A14);
  static const accent100 = Color(0xFFF6D9CC);
  static const accent50 = Color(0xFFFBEFE9);

  /// Neutral ink scale.
  static const ink900 = Color(0xFF1D1D1F);
  static const ink700 = Color(0xFF424245);
  static const ink500 = Color(0xFF6E6E73);
  static const ink400 = Color(0xFF86868B);
  static const ink200 = Color(0xFFE5E5EA);
  static const ink100 = Color(0xFFF0F0F2);
  static const ink50 = Color(0xFFF5F5F7);

  /// Status tints.
  static const ok50 = Color(0xFFE8F7E8);
  static const ok700 = Color(0xFF1A7F37);
  static const info50 = Color(0xFFE7F1FD);
  static const info600 = Color(0xFF0F5DC4);

  static const danger = Color(0xFF912018);
  static const dangerBg = Color(0xFFFDF0EF);
  static const dangerBorder = Color(0xFFFADCD9);

  static const border = Color(0xFFE5E5EA);
  static const textMuted = Color(0xFF6E6E73);
  static const heading = navy700;
  static const pageBg = Color(0xFFFFFFFF);
}

class AqarRadius {
  // One small radius everywhere (2026-10-26). The old 12-14px cards and pill buttons
  // were the stock "app template" look; 8 reads as drawn on purpose.
  static const card = 8.0;
  static const control = 8.0;
  static const tile = 8.0;

  /// Kept for the few true capsules left (count badges); not for buttons or chips.
  static const pill = 999.0;
}

/// Type, matching the website (src/app/layout.tsx, 2026-10-26):
///
///   Bricolage Grotesque sets Latin and every figure. Its tabular figures keep commas
///   narrow, so "13,800,000" lines up in lists without spreading out. (Schibsted
///   Grotesk was tried first and dropped for that reason, as on the website.)
///   IBM Plex Sans Arabic sets the Arabic letters. Latin comes first in the stack, so
///   digits inside Arabic copy still come from Bricolage, exactly as on the web.
///
/// Both are bundled (assets/fonts, OFL), not fetched: the app must render offline and
/// Google Fonts is slow or blocked on some Egyptian networks.
class AqarType {
  static const family = 'Bricolage';
  static const fallback = ['PlexArabic'];

  /// Lining, fixed-width digits for prices, areas and counts.
  static const tnum = [FontFeature.tabularFigures()];

  /// A price or a figure that should line up with the ones above and below it.
  static TextStyle figure({double size = 15, FontWeight weight = FontWeight.w700, Color color = AqarColors.ink900}) =>
      TextStyle(fontSize: size, fontWeight: weight, color: color, fontFeatures: tnum, height: 1.2);
}

ThemeData buildAqarTheme() {
  const fontFamily = AqarType.family;
  const fallback = AqarType.fallback;
  final radius = BorderRadius.circular(AqarRadius.control);
  final buttonShape = RoundedRectangleBorder(borderRadius: radius);
  const buttonText = TextStyle(
    fontFamily: fontFamily,
    fontFamilyFallback: fallback,
    fontSize: 15,
    fontWeight: FontWeight.w600,
  );

  final base = ThemeData(useMaterial3: true, fontFamily: fontFamily, fontFamilyFallback: fallback);

  return base.copyWith(
    scaffoldBackgroundColor: AqarColors.pageBg,
    textTheme: base.textTheme.apply(bodyColor: AqarColors.ink900, displayColor: AqarColors.ink900),
    colorScheme: ColorScheme.fromSeed(
      seedColor: AqarColors.brand500,
      primary: AqarColors.brand500,
      secondary: AqarColors.accent500,
      surface: Colors.white,
      error: AqarColors.danger,
    ),
    // White, quiet bar with ink type (owner, 2026-10-11), matching the website. No
    // shadow on scroll: a hairline is enough.
    appBarTheme: const AppBarTheme(
      backgroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      foregroundColor: AqarColors.ink900,
      elevation: 0,
      scrolledUnderElevation: 0,
      shape: Border(bottom: BorderSide(color: AqarColors.border)),
      centerTitle: false,
      titleTextStyle: TextStyle(
        fontFamily: fontFamily,
        fontFamilyFallback: fallback,
        fontSize: 18,
        height: 1.2,
        fontWeight: FontWeight.w700,
        color: AqarColors.ink900,
      ),
    ),
    cardTheme: CardThemeData(
      color: Colors.white,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AqarRadius.card),
        side: const BorderSide(color: AqarColors.border),
      ),
      margin: EdgeInsets.zero,
    ),
    // Primary action: an outline in forest with the label in the same forest (owner,
    // 2026-10-11). Kept on FilledButton so every existing call site picks it up.
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: Colors.transparent,
        foregroundColor: AqarColors.brand500,
        disabledBackgroundColor: Colors.transparent,
        disabledForegroundColor: AqarColors.ink400,
        minimumSize: const Size(0, 48),
        padding: const EdgeInsets.symmetric(horizontal: 18),
        side: const BorderSide(color: AqarColors.brand500, width: 1.5),
        shape: buttonShape,
        elevation: 0,
        textStyle: buttonText,
      ).copyWith(
        side: WidgetStateProperty.resolveWith(
          (states) => BorderSide(
            color: states.contains(WidgetState.disabled) ? AqarColors.ink200 : AqarColors.brand500,
            width: 1.5,
          ),
        ),
        overlayColor: const WidgetStatePropertyAll(AqarColors.brand50),
      ),
    ),
    // Secondary: a quiet grey outline in ink.
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: AqarColors.ink900,
        minimumSize: const Size(0, 48),
        padding: const EdgeInsets.symmetric(horizontal: 16),
        side: const BorderSide(color: AqarColors.ink200),
        shape: buttonShape,
        textStyle: buttonText,
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: AqarColors.brand500,
        shape: buttonShape,
        textStyle: buttonText.copyWith(fontSize: 14),
      ),
    ),
    segmentedButtonTheme: SegmentedButtonThemeData(
      style: ButtonStyle(
        shape: WidgetStatePropertyAll(buttonShape),
        backgroundColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected) ? Colors.white : AqarColors.navy50,
        ),
        foregroundColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected) ? AqarColors.accent600 : AqarColors.ink500,
        ),
        side: const WidgetStatePropertyAll(BorderSide(color: AqarColors.ink200)),
      ),
    ),
    sliderTheme: const SliderThemeData(
      activeTrackColor: AqarColors.accent500,
      thumbColor: AqarColors.accent500,
      inactiveTrackColor: AqarColors.ink200,
    ),
    // Selected tab: rust icon and label, no tinted capsule behind it.
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: Colors.white,
      indicatorColor: Colors.transparent,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      height: 64,
      labelTextStyle: WidgetStateProperty.resolveWith(
        (s) => TextStyle(
          fontFamily: fontFamily,
          fontFamilyFallback: fallback,
          fontSize: 11.5,
          fontWeight: s.contains(WidgetState.selected) ? FontWeight.w700 : FontWeight.w500,
          color: s.contains(WidgetState.selected) ? AqarColors.accent600 : AqarColors.ink500,
        ),
      ),
      iconTheme: WidgetStateProperty.resolveWith(
        (s) => IconThemeData(size: 22, color: s.contains(WidgetState.selected) ? AqarColors.accent500 : AqarColors.ink500),
      ),
    ),
    checkboxTheme: CheckboxThemeData(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(3)),
      fillColor: WidgetStateProperty.resolveWith(
        (s) => s.contains(WidgetState.selected) ? AqarColors.brand500 : Colors.transparent,
      ),
    ),
    chipTheme: ChipThemeData(
      selectedColor: AqarColors.accent50,
      side: const BorderSide(color: AqarColors.ink200),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
    ),
    bottomSheetTheme: const BottomSheetThemeData(
      backgroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(10))),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: AqarColors.ink900,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
    ),
    popupMenuTheme: PopupMenuThemeData(
      color: Colors.white,
      surfaceTintColor: Colors.transparent,
      elevation: 2,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(6),
        side: const BorderSide(color: AqarColors.border),
      ),
    ),
    listTileTheme: const ListTileThemeData(
      contentPadding: EdgeInsets.symmetric(horizontal: 16),
      iconColor: AqarColors.ink500,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      border: OutlineInputBorder(
        borderRadius: radius,
        borderSide: const BorderSide(color: AqarColors.border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: radius,
        borderSide: const BorderSide(color: AqarColors.ink200),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: radius,
        borderSide: const BorderSide(color: AqarColors.brand500, width: 1.6),
      ),
      labelStyle: const TextStyle(color: AqarColors.textMuted, fontSize: 14),
    ),
    dividerTheme: const DividerThemeData(
      color: AqarColors.border,
      thickness: 1,
      space: 1,
    ),
  );
}
