/// Market segments: residential, commercial, coastal.
///
/// The Dart mirror of `propshop-web/src/lib/segments.ts` — the top-level cut of the
/// catalogue, and the tabs on discover and search.
///
/// WHAT IS NOT HERE, DELIBERATELY: the rule deciding which segment a listing belongs to.
/// That is a `where` clause the server owns. The app sends `segment=coastal` and the
/// server decides what qualifies, so the two clients can never disagree about what
/// "coastal" means — and adding a coastal area needs no app release.
///
/// For the record, the server's rule is: coastal when the unit's AREA is flagged coastal
/// (not its type — an apartment in Marassi is a coastal property and a chalet in Sheikh
/// Zayed is not); commercial when the type is office or retail; residential otherwise.
/// Coastal is evaluated first, so the three partition the catalogue exactly.
library;

import 'lang.dart';

enum Segment { residential, commercial, coastal }

/// The wire value, matching the server's `segment` query parameter.
String segmentSlug(Segment s) => switch (s) {
  Segment.residential => 'residential',
  Segment.commercial => 'commercial',
  Segment.coastal => 'coastal',
};

String segmentLabelAr(Segment s) => switch (s) {
  Segment.residential => 'سكني',
  Segment.commercial => 'تجاري',
  Segment.coastal => 'ساحلي',
};

String segmentLabelEn(Segment s) => switch (s) {
  Segment.residential => 'Residential',
  Segment.commercial => 'Commercial',
  Segment.coastal => 'Coastal',
};

/// The label in the app's current language.
String segmentLabel(Segment s) => isEn ? segmentLabelEn(s) : segmentLabelAr(s);

/// Parse a wire value back, tolerating anything unexpected.
Segment? segmentFrom(String? slug) {
  for (final s in Segment.values) {
    if (segmentSlug(s) == slug) return s;
  }
  return null;
}

/// Buy or rent. Independent of the segment: you can rent a shop or buy a chalet, so the
/// two questions are asked by two controls rather than one combined row of tabs.
enum Purpose { sale, rent }

String purposeSlug(Purpose p) => p == Purpose.rent ? 'rent' : 'sale';

String purposeLabelAr(Purpose p) => p == Purpose.rent ? 'للإيجار' : 'للبيع';

String purposeLabelEn(Purpose p) => p == Purpose.rent ? 'For rent' : 'For sale';

/// The label in the app's current language.
String purposeLabel(Purpose p) => isEn ? purposeLabelEn(p) : purposeLabelAr(p);

Purpose purposeFrom(String? slug) =>
    slug == 'rent' ? Purpose.rent : Purpose.sale;
