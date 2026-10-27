import 'package:flutter_test/flutter_test.dart';
import 'package:aqarsale_app/services/format.dart';
import 'package:aqarsale_app/widgets/listing_card.dart';

/// These expectations are the website's output for the same inputs. They exist to catch
/// the two clients drifting apart on a number the user reads on both.
void main() {
  test('formatPrice matches the web implementation', () {
    expect(formatPrice(9800000), '9.8 مليون ج.م');
    expect(formatPrice(10050000), '10.1 مليون ج.م');
    expect(formatPrice(9000000), '9 مليون ج.م');
    expect(formatPrice(14350000), '14.3 مليون ج.م');
    expect(formatPrice(125000000), '125 مليون ج.م');
    expect(formatPrice(850000), '850 ألف ج.م');
    expect(formatPrice(0), '—');
  });

  test('Arabic output uses Latin digits', () {
    expect(formatNumber(1234), '1,234');
    expect(formatPriceExact(9800000), contains('9,800,000'));
  });

  test('relative day labels follow Arabic plural rules', () {
    expect(relativeDays(0), 'النهارده');
    expect(relativeDays(1), 'امبارح');
    expect(relativeDays(2), 'من يومين');
    expect(relativeDays(5), 'من 5 أيام');
    expect(relativeDays(12), 'من 12 يوم');
    expect(relativeDays(3, ar: false), '3 days ago');
    expect(relativeDays(1, ar: false), '1 day ago');
  });

  test('latiniseDigits converts Arabic-Indic digits', () {
    expect(latiniseDigits('٠١٢٣٤٥٦٧٨٩'), '0123456789');
  });

  test('countdown reads naturally in both languages', () {
    expect(formatCountdown(const Duration(hours: 3)), startsWith('باقي'));
    expect(formatCountdown(const Duration(hours: -1)), startsWith('متأخر'));
    expect(formatCountdown(const Duration(hours: 3), ar: false), contains('left'));
    expect(formatCountdown(const Duration(hours: -1), ar: false), contains('overdue'));
  });
}
