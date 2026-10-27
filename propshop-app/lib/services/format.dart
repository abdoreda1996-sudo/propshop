import 'package:intl/intl.dart';

import 'lang.dart';

/// Mirrors src/lib/format.ts so a price reads identically on web and mobile.
///
/// Arabic uses Latin ("Western Arabic") digits. Dart's intl has no `-u-nu-latn` locale
/// extension, and `ar_EG` renders Arabic-Indic digits (٢٤٩) — which on one card would
/// show the price as "10.1 مليون" and the size as "٢٤٩ م²". Numbers therefore format
/// with the `en` pattern, and dates keep Arabic month names with their digits latinised.
const _arNumberLocale = 'en';

/// Converts Arabic-Indic digits to Latin ones, for output we cannot format directly.
String latiniseDigits(String input) {
  const zero = 0x0660; // ٠
  return input.split('').map((ch) {
    final code = ch.codeUnitAt(0);
    if (code >= zero && code <= zero + 9) {
      return String.fromCharCode(code - zero + 0x30);
    }
    return ch;
  }).join();
}

/// Matches JavaScript's `Number(x.toFixed(n))`, which drops trailing zeros.
///
/// Without this the app renders "9.80 مليون" where the website renders "9.8 مليون"
/// for the same listing — the two clients disagreeing about one number.
String _trimTrailingZeros(String fixed) {
  if (!fixed.contains('.')) return fixed;
  var s = fixed.replaceFirst(RegExp(r'0+$'), '');
  if (s.endsWith('.')) s = s.substring(0, s.length - 1);
  return s;
}

/// `ar` defaults to the app's current language; pass it only to force one.
String formatPrice(double value, {String currency = 'EGP', bool? ar}) {
  final a = ar ?? !isEn;
  if (value <= 0) return '—';
  final sym = currencySymbol(currency, ar: a);
  if (value >= 1000000) {
    final m = value / 1000000;
    final n = m >= 100
        ? m.round().toString()
        : _trimTrailingZeros(m.toStringAsFixed(m >= 10 ? 1 : 2));
    return a ? '$n مليون $sym' : '${n}M $sym';
  }
  if (value >= 1000) {
    final k = (value / 1000).round();
    return a ? '$k ألف $sym' : '${k}K $sym';
  }
  return '${value.round()} $sym';
}

String formatPriceExact(double value, {String currency = 'EGP', bool? ar}) {
  final a = ar ?? !isEn;
  final f = NumberFormat.decimalPattern(a ? _arNumberLocale : 'en');
  return '${f.format(value.round())} ${currencySymbol(currency, ar: a)}';
}

String currencySymbol(String currency, {bool? ar}) {
  const map = {
    'EGP': ['ج.م', 'EGP'],
    'SAR': ['ر.س', 'SAR'],
    'AED': ['د.إ', 'AED'],
    'USD': [r'$', 'USD'],
    'KWD': ['د.ك', 'KWD'],
    'QAR': ['ر.ق', 'QAR'],
  };
  final pair = map[currency] ?? map['EGP']!;
  return (ar ?? !isEn) ? pair[0] : pair[1];
}

String formatNumber(num value, {bool? ar}) => NumberFormat.decimalPattern(
  (ar ?? !isEn) ? _arNumberLocale : 'en',
).format(value);

String formatDate(DateTime d, {bool? ar}) {
  final a = ar ?? !isEn;
  try {
    final formatted = DateFormat.yMMMd(a ? 'ar_EG' : 'en_GB').format(d);
    return a ? latiniseDigits(formatted) : formatted;
  } on Exception {
    // Locale symbols not loaded (see initializeDateFormatting in main). A plain ISO
    // date is worse than a localised one, but far better than crashing the screen.
    return '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
  }
}

/// Date and time together, for viewing slots ("الأربعاء ١٩ سبتمبر ٦:٠٠ م").
///
/// Same fallback as formatDate: a slot the user cannot read is bad, a crashed screen is
/// worse.
String formatDateTime(DateTime d, {bool? ar}) {
  final a = ar ?? !isEn;
  try {
    final formatted = DateFormat(
      'EEE d MMM · h:mm a',
      a ? 'ar_EG' : 'en_GB',
    ).format(d);
    return a ? latiniseDigits(formatted) : formatted;
  } on Exception {
    // 12-hour even in the fallback — times are never shown on a 24-hour clock.
    final h = d.hour % 12 == 0 ? 12 : d.hour % 12;
    final suffix = d.hour < 12 ? (a ? 'ص' : 'AM') : (a ? 'م' : 'PM');
    return '${formatDate(d, ar: a)} $h:${d.minute.toString().padLeft(2, '0')} $suffix';
  }
}

/// Mirrors formatCountdown() in src/lib/sla.ts.
String formatCountdown(Duration remaining, {bool? ar}) {
  final abs = remaining.abs();
  final hours = abs.inHours;
  final minutes = abs.inMinutes % 60;
  final late = remaining.isNegative;
  if (ar ?? !isEn) {
    final body = hours > 0 ? '$hours ساعة و$minutes دقيقة' : '$minutes دقيقة';
    return late ? 'متأخر $body' : 'باقي $body';
  }
  final body = hours > 0 ? '${hours}h ${minutes}m' : '${minutes}m';
  return late ? '$body overdue' : '$body left';
}

const unitTypeLabelsAr = {
  'apartment': 'شقة',
  'villa': 'فيلا مستقلة',
  'townhouse': 'تاون هاوس',
  'twinhouse': 'توين هاوس',
  'ground_apartment': 'شقة أرضي',
  'penthouse': 'بنتهاوس',
  'duplex': 'دوبلكس',
  'studio': 'استوديو',
  'chalet': 'شاليه',
  'office': 'مكتب إداري',
  'retail': 'محل تجاري',
};

const finishingLabelsAr = {
  'core_shell': 'على المحارة',
  'semi_finished': 'نصف تشطيب',
  'fully_finished': 'تشطيب كامل',
  'furnished': 'مفروش',
};

const requestStatusLabelsAr = {
  'received': 'تم الاستلام',
  'assigned': 'تم التعيين لمستشار',
  'contacted': 'تم التواصل',
  'viewing_scheduled': 'تم تحديد معاينة',
  'offer': 'عرض سعر',
  'deal': 'صفقة جارية',
  'closed': 'مغلق',
  'cancelled': 'ملغي',
};

/// The six rooms the publish gate requires (src/lib/enums.ts REQUIRED_ROOMS).
const requiredRooms = [
  'living',
  'bedroom',
  'kitchen',
  'bathroom',
  'facade',
  'view',
];

const roomLabelsAr = {
  'living': 'الريسبشن',
  'bedroom': 'غرفة النوم',
  'kitchen': 'المطبخ',
  'bathroom': 'الحمام',
  'facade': 'واجهة المبنى',
  'view': 'الإطلالة أو البلكونة',
};

const unitTypeLabelsEn = {
  'apartment': 'Apartment',
  'villa': 'Standalone villa',
  'townhouse': 'Townhouse',
  'twinhouse': 'Twin house',
  'ground_apartment': 'Ground apartment',
  'penthouse': 'Penthouse',
  'duplex': 'Duplex',
  'studio': 'Studio',
  'chalet': 'Chalet',
  'office': 'Office',
  'retail': 'Retail shop',
};

const finishingLabelsEn = {
  'core_shell': 'Core & shell',
  'semi_finished': 'Semi-finished',
  'fully_finished': 'Fully finished',
  'furnished': 'Furnished',
};

const requestStatusLabelsEn = {
  'received': 'Received',
  'assigned': 'Assigned to an advisor',
  'contacted': 'Contacted',
  'viewing_scheduled': 'Viewing scheduled',
  'offer': 'Offer',
  'deal': 'Deal in progress',
  'closed': 'Closed',
  'cancelled': 'Cancelled',
};

const roomLabelsEn = {
  'living': 'Living room',
  'bedroom': 'Bedroom',
  'kitchen': 'Kitchen',
  'bathroom': 'Bathroom',
  'facade': 'Building facade',
  'view': 'View or balcony',
};

/// Language-aware lookups. Prefer these over the raw `*LabelsAr` maps in UI code; they
/// fall back to the Arabic label, then to the key, so an unknown value never shows blank.
String _label(Map<String, String> ar, Map<String, String> en, String key) =>
    (isEn ? en[key] : null) ?? ar[key] ?? key;

String unitTypeLabel(String key) =>
    _label(unitTypeLabelsAr, unitTypeLabelsEn, key);
String finishingLabel(String key) =>
    _label(finishingLabelsAr, finishingLabelsEn, key);
String requestStatusLabel(String key) =>
    _label(requestStatusLabelsAr, requestStatusLabelsEn, key);
String roomLabel(String key) => _label(roomLabelsAr, roomLabelsEn, key);
