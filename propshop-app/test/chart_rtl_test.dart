import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:aqarsale_app/widgets/price_history_chart.dart';
import 'package:aqarsale_app/widgets/common.dart';
import 'package:aqarsale_app/theme/tokens.dart';

/// Time must run with the reading direction, matching PriceHistoryChart.tsx on the web:
/// left-to-right in English, right-to-left in Arabic. A canvas always has x=0 on the
/// left, so RTL requires an explicit mirror — these tests pin that behaviour.
void main() {
  group('chart x mapping', () {
    const width = 600.0;
    const pad = 10.0;

    test('LTR runs oldest-left to newest-right', () {
      final first = PricePainterX.xFor(0, 3, width, rtl: false, pad: pad);
      final last = PricePainterX.xFor(2, 3, width, rtl: false, pad: pad);
      expect(first, pad);
      expect(last, width - pad);
      expect(first, lessThan(last));
    });

    test('RTL mirrors it: oldest on the right', () {
      final first = PricePainterX.xFor(0, 3, width, rtl: true, pad: pad);
      final last = PricePainterX.xFor(2, 3, width, rtl: true, pad: pad);
      expect(first, width - pad);
      expect(last, pad);
      expect(first, greaterThan(last));
    });

    test('the midpoint is unchanged by direction', () {
      expect(
        PricePainterX.xFor(1, 3, width, rtl: false, pad: pad),
        PricePainterX.xFor(1, 3, width, rtl: true, pad: pad),
      );
    });

    test('a single point does not divide by zero', () {
      expect(PricePainterX.xFor(0, 1, width, rtl: false, pad: pad), pad);
      expect(PricePainterX.xFor(0, 1, width, rtl: true, pad: pad), width - pad);
    });
  });

  group('fair price band marker', () {
    Widget wrap(TextDirection dir, Widget child) => MaterialApp(
          theme: buildAqarTheme(),
          home: Directionality(
            textDirection: dir,
            child: Scaffold(body: Center(child: SizedBox(width: 200, child: child))),
          ),
        );

    /// An asking price at the bottom of the band sits at the START of the reading
    /// direction: left in LTR, right in RTL.
    Future<double> markerCentre(WidgetTester tester, TextDirection dir) async {
      await tester.pumpWidget(
        wrap(dir, const FairPriceBand(asking: 100, low: 100, high: 200)),
      );
      await tester.pump();
      final marker = find.byWidgetPredicate(
        (w) => w is Container && w.constraints?.maxWidth == 3.0,
      );
      expect(marker, findsOneWidget);
      return tester.getCenter(marker).dx;
    }

    testWidgets('sits at the left edge in LTR', (tester) async {
      final screenCentre = 400.0;
      final x = await markerCentre(tester, TextDirection.ltr);
      expect(x, lessThan(screenCentre));
    });

    testWidgets('sits at the right edge in RTL', (tester) async {
      final screenCentre = 400.0;
      final x = await markerCentre(tester, TextDirection.rtl);
      expect(x, greaterThan(screenCentre));
    });
  });
}
