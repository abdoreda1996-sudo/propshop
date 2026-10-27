import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:aqarsale_app/widgets/price_history_chart.dart';
import 'package:aqarsale_app/theme/tokens.dart';
import 'package:intl/date_symbol_data_local.dart';

/// Renders the real chart and inspects the painted pixels.
///
/// The x-mapping unit tests prove the maths; this proves the widget actually paints
/// mirrored output, which is what a screenshot would have shown.
///
/// Data is the real AQ-100275 history: 14,650,000 on 14 Jul falling to 14,100,000 on
/// 13 Aug. The line therefore starts HIGH at the oldest point and ends LOW at the
/// newest, so "where is the high end?" tells us which way time runs.
final _points = [
  PricePoint(price: 14650000, at: DateTime(2026, 7, 14), kind: 'ask'),
  PricePoint(price: 14100000, at: DateTime(2026, 8, 13), kind: 'ask'),
];

Widget _wrap(TextDirection dir, Widget child) => MaterialApp(
      theme: buildAqarTheme(),
      home: Directionality(
        textDirection: dir,
        child: Scaffold(body: Center(child: SizedBox(width: 340, child: child))),
      ),
    );

/// Returns the x of the chart line's highest painted point, as a fraction of width.
///
/// The oldest price here is the highest, so this answers "which end of the chart holds
/// the oldest point?" — which is exactly what the RTL mirroring changes.
Future<double> _peakXFraction(WidgetTester tester, TextDirection dir) async {
  final key = GlobalKey();
  await tester.pumpWidget(
    _wrap(
      dir,
      RepaintBoundary(
        key: key,
        child: PriceHistoryChart(points: _points, ar: dir == TextDirection.rtl),
      ),
    ),
  );
  await tester.pumpAndSettle();

  late ByteData data;
  late ui.Image image;
  await tester.runAsync(() async {
    final boundary = key.currentContext!.findRenderObject() as RenderRepaintBoundary;
    image = await boundary.toImage(pixelRatio: 1);
    data = (await image.toByteData(format: ui.ImageByteFormat.rawRgba))!;
  });

  final w = image.width;
  final h = image.height;
  final bytes = data.buffer.asUint8List();

  var bestY = h, bestX = -1;
  // Search only the chart band; the dated list below also paints dark text.
  for (var y = 0; y < (h * 0.45).round(); y++) {
    for (var x = 0; x < w; x++) {
      final i = (y * w + x) * 4;
      // The line is ink900 (#23262A): dark and opaque.
      if (bytes[i + 3] > 200 && bytes[i] < 80 && bytes[i + 1] < 80 && bytes[i + 2] < 80) {
        if (y < bestY) {
          bestY = y;
          bestX = x;
        }
      }
    }
  }

  expect(bestX, greaterThanOrEqualTo(0), reason: 'no chart line pixels found');
  return bestX / w;
}

void main() {
  setUpAll(() async => initializeDateFormatting('ar'));

  testWidgets('LTR puts the oldest (highest) price on the left', (tester) async {
    expect(await _peakXFraction(tester, TextDirection.ltr), lessThan(0.25));
  });

  testWidgets('RTL puts the oldest (highest) price on the right', (tester) async {
    expect(await _peakXFraction(tester, TextDirection.rtl), greaterThan(0.75));
  });

  testWidgets('the two directions are mirror images', (tester) async {
    final ltr = await _peakXFraction(tester, TextDirection.ltr);
    final rtl = await _peakXFraction(tester, TextDirection.rtl);
    // Mirrored about the centre line.
    expect((ltr + rtl - 1).abs(), lessThan(0.05));
  });
}
