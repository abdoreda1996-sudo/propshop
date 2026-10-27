import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:provider/provider.dart';

import 'services/api.dart';
import 'services/lang.dart';
import 'services/session.dart';
import 'theme/tokens.dart';
import 'screens/home_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // DateFormat with a non-English locale throws LocaleDataException until its symbols
  // are loaded. Every Arabic date in the app (the advisor response date, the price
  // history list) depends on this.
  await initializeDateFormatting('ar');
  await initializeDateFormatting('en');
  await LangController.instance.load();
  runApp(const PropShopApp());
}

class PropShopApp extends StatelessWidget {
  const PropShopApp({super.key});

  @override
  Widget build(BuildContext context) {
    final api = Api();

    return MultiProvider(
      providers: [
        Provider<Api>.value(value: api),
        ChangeNotifierProvider(
          create: (_) => SessionController(api)..bootstrap(),
        ),
        ChangeNotifierProvider<LangController>.value(
          value: LangController.instance,
        ),
      ],
      child: Consumer<LangController>(
        builder: (context, lang, _) => MaterialApp(
          title: tr('بروب شوب', 'PropShop'),
          debugShowCheckedModeBanner: false,
          theme: buildAqarTheme(),
          // The web build is opened on desktops too: let a mouse drag page through a
          // card's photos the way a finger does (Flutter ignores mouse drags by default).
          scrollBehavior: const MaterialScrollBehavior().copyWith(
            dragDevices: {
              PointerDeviceKind.touch,
              PointerDeviceKind.mouse,
              PointerDeviceKind.trackpad,
              PointerDeviceKind.stylus,
            },
          ),
          // Arabic RTL is the default from day one (Section 8); English is a user switch.
          locale: lang.locale,
          supportedLocales: const [Locale('ar'), Locale('en')],
          localizationsDelegates: const [
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          builder: (context, child) => Directionality(
            textDirection: lang.direction,
            child: child ?? const SizedBox.shrink(),
          ),
          home: const HomeScreen(),
        ),
      ),
    );
  }
}
