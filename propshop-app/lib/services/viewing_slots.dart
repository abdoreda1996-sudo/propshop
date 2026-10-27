import 'package:intl/intl.dart';

import 'format.dart';
import 'lang.dart';

/// Viewing windows — mirrors propshop-web/src/lib/viewingSlots.ts. Three a day, in Cairo
/// time, inside working hours (11 AM – 9 PM). The app never sends a clock time: it sends
/// `{date, window}` and the server turns that into Cairo's instant.
class ViewingWindow {
  const ViewingWindow(this.key, this.ar, this.en);
  final String key;
  final String ar;
  final String en;
  String get label => tr(ar, en);
}

const viewingWindows = [
  ViewingWindow('11-14', '11 ص – 2 م', '11 AM – 2 PM'),
  ViewingWindow('14-18', '2 م – 6 م', '2 PM – 6 PM'),
  ViewingWindow('18-21', '6 م – 9 م', '6 PM – 9 PM'),
];

/// One pick in the request sheet.
class SlotPick {
  const SlotPick(this.date, this.window);
  final String date; // YYYY-MM-DD
  final String window;

  Map<String, String> toJson() => {'date': date, 'window': window};

  @override
  bool operator ==(Object other) =>
      other is SlotPick && other.date == date && other.window == window;
  @override
  int get hashCode => Object.hash(date, window);
}

/// A slot as the server describes it (`describeSlot`): Cairo day + window label.
class SlotView {
  const SlotView({
    required this.at,
    required this.date,
    required this.labelAr,
    required this.labelEn,
  });
  final String at;
  final String date;
  final String labelAr;
  final String labelEn;

  static SlotView? fromJson(Object? j) {
    if (j is! Map<String, dynamic>) return null;
    return SlotView(
      at: (j['at'] ?? '') as String,
      date: (j['date'] ?? '') as String,
      labelAr: (j['labelAr'] ?? '') as String,
      labelEn: (j['labelEn'] ?? '') as String,
    );
  }

  /// "Tue 3 Oct · 2 PM – 6 PM" — 12-hour, never a raw 24-hour clock.
  String get label {
    final d = DateTime.tryParse(date);
    final day = d == null ? date : dayLabel(d);
    return '$day · ${tr(labelAr, labelEn)}';
  }
}

String dayLabel(DateTime d) {
  final ar = !isEn;
  try {
    final s = DateFormat('EEE d MMM', ar ? 'ar_EG' : 'en_GB').format(d);
    return ar ? latiniseDigits(s) : s;
  } on Exception {
    return '${d.year}-${d.month}-${d.day}';
  }
}

String ymd(DateTime d) =>
    '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
