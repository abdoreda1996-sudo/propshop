import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../theme/tokens.dart';

/// The app's display language: Arabic (default, RTL) or English (LTR).
///
/// Read it anywhere with the top-level [isEn] / [tr] — including model and formatting
/// code that has no BuildContext. Switching calls [LangController.set], which repaints the
/// whole tree in place (see [_rebuildAll]) so the navigation stack and form state survive.
class LangController extends ChangeNotifier {
  static const _prefsKey = 'app_lang';

  /// The one instance, created at startup and provided to the tree in main().
  static final LangController instance = LangController();

  /// The current language for code without a context. Kept in step with the controller.
  static String current = 'ar';

  String get code => current;
  bool get isEnglish => current == 'en';
  Locale get locale => Locale(current);
  TextDirection get direction =>
      isEnglish ? TextDirection.ltr : TextDirection.rtl;

  Future<void> load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final saved = prefs.getString(_prefsKey);
      if (saved == 'en' || saved == 'ar') {
        current = saved!;
        notifyListeners();
      }
    } catch (_) {
      // No storage (a private browser window): stay on Arabic.
    }
  }

  Future<void> set(String code, BuildContext context) async {
    if (code == current) return;
    current = code;
    notifyListeners();
    _rebuildAll(context);
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_prefsKey, code);
    } catch (_) {}
  }

  Future<void> toggle(BuildContext context) =>
      set(isEnglish ? 'ar' : 'en', context);

  /// Mark every element dirty so strings resolved through [tr] are re-read.
  ///
  /// Most text is picked in `build` via the global, not via an InheritedWidget, so nothing
  /// would otherwise know to rebuild. Walking from the root keeps pushed routes and their
  /// state — re-keying the Navigator would throw the user back to the home tab.
  static void _rebuildAll(BuildContext context) {
    void rebuild(Element el) {
      el.markNeedsBuild();
      el.visitChildren(rebuild);
    }

    final root =
        context.findRootAncestorStateOfType<NavigatorState>()?.context ??
        context;
    (root as Element).visitChildren(rebuild);
  }
}

/// True when the app is showing English.
bool get isEn => LangController.current == 'en';

/// Pick the string for the current language. Arabic first, matching the app's default.
String tr(String ar, String en) => isEn ? en : ar;

/// The language switch for the top corner of every screen: shows the language you would
/// switch TO, which is what a tap does.
class LangToggleButton extends StatelessWidget {
  const LangToggleButton({super.key, this.onDark = false});

  /// On a photo or navy background the label goes white.
  final bool onDark;

  @override
  Widget build(BuildContext context) {
    final lang = LangController.instance;
    // Inside an AppBar the icon theme already carries the bar's foreground (white on the
    // navy bar), so follow it; elsewhere fall back to navy.
    final color = onDark
        ? Colors.white
        : (IconTheme.of(context).color ?? AqarColors.navy700);
    return Tooltip(
      message: tr('English', 'العربية'),
      child: TextButton(
        onPressed: () => lang.toggle(context),
        style: TextButton.styleFrom(
          foregroundColor: color,
          padding: const EdgeInsets.symmetric(horizontal: 10),
          minimumSize: const Size(0, 36),
        ),
        child: Text(
          isEn ? 'عربي' : 'EN',
          style: TextStyle(
            fontWeight: FontWeight.w800,
            fontSize: 13,
            color: color,
          ),
        ),
      ),
    );
  }
}
