// Market segments and purpose.
//
// The app deliberately does NOT own the rule deciding which segment a listing belongs
// to — the server does, so the two clients cannot disagree and a new coastal area needs
// no app release. What the app owns is the wire vocabulary, and these tests pin it: a
// slug typo here would silently return an unfiltered list rather than an error.

import 'package:flutter_test/flutter_test.dart';

import 'package:aqarsale_app/services/segments.dart';

void main() {
  group('segments', () {
    test('slugs match the values the server accepts', () {
      // These strings go straight onto /api/listings?segment=… — the server ignores an
      // unrecognised value, so a typo shows every listing instead of failing loudly.
      expect(segmentSlug(Segment.residential), 'residential');
      expect(segmentSlug(Segment.commercial), 'commercial');
      expect(segmentSlug(Segment.coastal), 'coastal');
    });

    test('there are exactly three, matching the tabs on the website', () {
      expect(Segment.values.length, 3);
    });

    test('every segment has an Arabic label', () {
      for (final s in Segment.values) {
        expect(segmentLabelAr(s), isNotEmpty, reason: '$s');
      }
    });

    test('labels are distinct, so the tabs are tellable apart', () {
      final labels = Segment.values.map(segmentLabelAr).toSet();
      expect(labels.length, Segment.values.length);
    });

    test('parsing round-trips', () {
      for (final s in Segment.values) {
        expect(segmentFrom(segmentSlug(s)), s, reason: '$s');
      }
    });

    test('an unknown slug parses to null — meaning every segment, not none', () {
      // Null is the "all" tab. Returning a default segment instead would silently narrow
      // someone's search to a market they did not pick.
      for (final bad in [null, '', 'COASTAL', 'resi', 'sale', '../etc']) {
        expect(segmentFrom(bad), isNull, reason: '$bad');
      }
    });
  });

  group('purpose', () {
    test('slugs match the server', () {
      expect(purposeSlug(Purpose.sale), 'sale');
      expect(purposeSlug(Purpose.rent), 'rent');
    });

    test('parsing round-trips', () {
      for (final p in Purpose.values) {
        expect(purposeFrom(purposeSlug(p)), p, reason: '$p');
      }
    });

    test('an unknown value falls back to sale rather than throwing', () {
      // Unlike segment, purpose has no "all" state — the server always needs one, and
      // sale is the larger market.
      for (final bad in [null, '', 'RENT', 'lease']) {
        expect(purposeFrom(bad), Purpose.sale, reason: '$bad');
      }
    });

    test('purpose and segment are independent vocabularies', () {
      // The reason there are two controls: you can rent a shop or buy a chalet. If a
      // purpose value ever collided with a segment slug, one control could answer the
      // other's question.
      final purposeSlugs = Purpose.values.map(purposeSlug).toSet();
      final segmentSlugs = Segment.values.map(segmentSlug).toSet();
      expect(purposeSlugs.intersection(segmentSlugs), isEmpty);
    });

    test('every purpose has an Arabic label', () {
      for (final p in Purpose.values) {
        expect(purposeLabelAr(p), isNotEmpty, reason: '$p');
      }
    });
  });
}
