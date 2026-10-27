import 'package:flutter/material.dart';

import '../services/format.dart';
import '../services/lang.dart';
import '../theme/tokens.dart';

class PricePoint {
  const PricePoint({required this.price, required this.at, required this.kind});
  final double price;
  final DateTime at;

  /// "ask" or "closed"; a realised price is drawn filled.
  final String kind;

  factory PricePoint.fromJson(Map<String, dynamic> j) => PricePoint(
    price: (j['price'] as num).toDouble(),
    at:
        DateTime.tryParse(j['changedAt']?.toString() ?? '')?.toLocal() ??
        DateTime.now(),
    kind: (j['kind'] ?? 'ask') as String,
  );
}

/// Price history, mirroring the website's chart.
///
/// Time runs with the reading direction: left-to-right in English, right-to-left in
/// Arabic. A canvas always has x=0 on the left, so in RTL the position is mirrored —
/// exactly as PriceHistoryChart.tsx does on the web.
class PriceHistoryChart extends StatelessWidget {
  const PriceHistoryChart({
    super.key,
    required this.points,
    bool? ar,
    this.currency = 'EGP',
  }) : _ar = ar;

  final List<PricePoint> points;

  /// Explicit language, for tests. Left null, the chart follows the app's language.
  final bool? _ar;
  bool get ar => _ar ?? !isEn;
  final String currency;

  @override
  Widget build(BuildContext context) {
    if (points.length < 2) return const SizedBox.shrink();

    final first = points.first.price;
    final last = points.last.price;
    // A zero first price (bad data) would print Infinity%.
    final changePct = first == 0 ? 0.0 : ((last - first) / first) * 100;
    final down = changePct < 0;

    // No card around it: it sits under its own section title on the listing page.
    return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    ar ? 'التغير منذ النشر' : 'Change since listing',
                    style: const TextStyle(
                      fontSize: 13,
                      color: AqarColors.textMuted,
                    ),
                  ),
                ),
                // Signed numbers are isolated as LTR so "-3.8%" does not render "3.8%-".
                Directionality(
                  textDirection: TextDirection.ltr,
                  child: Text(
                    '${changePct >= 0 ? '+' : ''}${changePct.toStringAsFixed(1)}%',
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      fontFeatures: AqarType.tnum,
                      color: down
                          ? AqarColors.ok700
                          : (changePct > 0
                                ? AqarColors.danger
                                : AqarColors.ink900),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            SizedBox(
              height: 110,
              width: double.infinity,
              child: CustomPaint(
                painter: _PricePainter(points: points, rtl: ar),
              ),
            ),
            const SizedBox(height: 12),
            ...points.map(
              (p) => Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Row(
                  children: [
                    Expanded(
                      child: Row(
                        children: [
                          // Flexible: with the "closed price" badge alongside it, a long
                          // localised date overflows the row on a narrow phone.
                          Flexible(
                            child: Text(
                              formatDate(p.at, ar: ar),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 12,
                                color: AqarColors.textMuted,
                              ),
                            ),
                          ),
                          if (p.kind == 'closed') ...[
                            const SizedBox(width: 6),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 6,
                                vertical: 2,
                              ),
                              decoration: BoxDecoration(
                                color: AqarColors.ok50,
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(
                                ar ? 'سعر التعاقد' : 'Closed price',
                                style: const TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w700,
                                  color: AqarColors.ok700,
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                    Text(
                      formatPriceExact(p.price, currency: currency, ar: ar),
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: AqarColors.ink900,
                        fontFeatures: AqarType.tnum,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
    );
  }
}

/// The chart's x mapping, exposed so a test can assert the RTL mirroring directly
/// rather than by pumping a screen and reading pixels.
class PricePainterX {
  const PricePainterX._();

  static double xFor(
    int i,
    int count,
    double width, {
    required bool rtl,
    double pad = 10,
  }) {
    final t = count > 1 ? i / (count - 1) : 0.0;
    final frac = rtl ? 1 - t : t;
    return pad + frac * (width - pad * 2);
  }
}

class _PricePainter extends CustomPainter {
  _PricePainter({required this.points, required this.rtl});

  final List<PricePoint> points;
  final bool rtl;

  static double xFor(
    int i,
    int count,
    double width, {
    required bool rtl,
    double pad = 10,
  }) => PricePainterX.xFor(i, count, width, rtl: rtl, pad: pad);

  @override
  void paint(Canvas canvas, Size size) {
    const pad = 10.0;
    final prices = points.map((p) => p.price).toList();
    final min = prices.reduce((a, b) => a < b ? a : b);
    final max = prices.reduce((a, b) => a > b ? a : b);
    final range = (max - min).abs() < 1 ? 1.0 : max - min;

    double y(double v) =>
        size.height - pad - ((v - min) / range) * (size.height - pad * 2);
    double x(int i) => xFor(i, points.length, size.width, rtl: rtl, pad: pad);

    final line = Paint()
      ..color = AqarColors.ink900
      ..strokeWidth = 2
      ..style = PaintingStyle.stroke
      ..strokeJoin = StrokeJoin.round
      ..strokeCap = StrokeCap.round;

    final path = Path();
    for (var i = 0; i < points.length; i++) {
      final p = Offset(x(i), y(points[i].price));
      if (i == 0) {
        path.moveTo(p.dx, p.dy);
      } else {
        path.lineTo(p.dx, p.dy);
      }
    }
    canvas.drawPath(path, line);

    for (var i = 0; i < points.length; i++) {
      final c = Offset(x(i), y(points[i].price));
      final closed = points[i].kind == 'closed';
      canvas.drawCircle(
        c,
        4,
        Paint()..color = closed ? AqarColors.ok700 : Colors.white,
      );
      canvas.drawCircle(
        c,
        4,
        Paint()
          ..color = closed ? AqarColors.ok700 : AqarColors.ink900
          ..strokeWidth = 2
          ..style = PaintingStyle.stroke,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _PricePainter old) =>
      old.points != points || old.rtl != rtl;
}
