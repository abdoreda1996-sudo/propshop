// The fee model (owner, 2026-10-02): flat by unit type for a sale, by monthly rent for a
// rental, by the unit received for a trade — per side, both sides in full.
//
// This file is the drift guard against `propshop-web/src/lib/fees.ts`: the same table is
// asserted on both sides, so a schedule change that reaches one and not the other fails.

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'package:aqarsale_app/services/fees.dart';

void main() {
  double sale(String type, [double amount = 10000000]) =>
      feePerSide(purpose: 'sale', unitType: type, amount: amount);

  group('sale — flat by unit type', () {
    test('apartment, studio, chalet, ground apartment pay 50,000 per side', () {
      for (final t in ['apartment', 'studio', 'chalet', 'ground_apartment']) {
        expect(sale(t), 50000, reason: t);
      }
    });
    test('villa, townhouse, twin house, duplex, penthouse, office, retail pay 100,000 per side', () {
      for (final t in ['villa', 'townhouse', 'twinhouse', 'duplex', 'penthouse', 'office', 'retail']) {
        expect(sale(t), 100000, reason: t);
      }
    });
    test('the price does not move it', () {
      expect(sale('villa', 5000000), sale('villa', 60000000));
      expect(sale('apartment', 1000000), sale('apartment', 99000000));
    });
    test('an unknown type pays the higher tier', () => expect(saleFeeForType('castle'), 100000));
  });

  group('rent — by monthly rent', () {
    test('up to 100,000 → 15,000; above → 50,000', () {
      expect(rentFeeFor(20000), 15000);
      expect(rentFeeFor(100000), 15000, reason: 'the boundary is in the low tier');
      expect(rentFeeFor(100001), 50000);
    });
    test('ignores the unit type', () {
      expect(feePerSide(purpose: 'rent', unitType: 'villa', amount: 30000), 15000);
    });
  });

  group('trade — by the unit received', () {
    test('villa ⇄ apartment', () {
      expect(tradeFeeForReceived(['villa']), 100000);
      expect(tradeFeeForReceived(['apartment']), 50000);
    });
    test('several units received → one fee, the highest', () {
      expect(tradeFeeForReceived(['apartment', 'townhouse']), 100000);
      expect(tradeFeeForReceived([]), 0);
    });
  });

  group('who pays', () {
    test('both sides, so a recorded total splits into two equal halves', () {
      final s = splitFee(200000);
      expect(s.buyer, 100000);
      expect(s.seller, 100000);
      expect(s.forRole('seller'), 100000);
    });
    test('junk degrades to zero', () => expect(splitFee(double.nan).total, 0));
  });

  group('the published wording', () {
    test('says unit type, each side in full, not a percentage — never price bands', () {
      for (final note in [pricingNoteEn, feeModelNoteEn]) {
        expect(note.toLowerCase(), contains('by unit type'));
        expect(note.toLowerCase(), isNot(contains('band')));
      }
      for (final note in [pricingNoteAr, feeModelNoteAr]) {
        expect(note, contains('نوع الوحدة'));
        expect(note, isNot(contains('شريحة')));
      }
      expect(pricingNoteEn, contains('not half'));
      expect(pricingNoteEn, contains('not a percentage'));
    });

    test('no app screen still describes price bands', () {
      // The same sweep the web runs (feeCopy.test.ts): the band wording lived outside
      // fees.dart last time, in the deal and discover screens.
      final offenders = <String>[];
      for (final f in Directory('lib').listSync(recursive: true).whereType<File>()) {
        if (!f.path.endsWith('.dart')) continue;
        final src = f.readAsStringSync();
        if (src.contains('شريحة السعر') || RegExp('by price band', caseSensitive: false).hasMatch(src)) {
          offenders.add(f.path);
        }
      }
      expect(offenders, isEmpty);
    });
  });

  test('matches the web schedule, read from propshop-web/src/lib/fees.ts', () {
    // When both repos sit side by side (they do in E:\\propshop), read the web figures
    // directly so a one-sided change cannot pass.
    final web = File('../propshop-web/src/lib/fees.ts');
    if (!web.existsSync()) return;
    final src = web.readAsStringSync();
    expect(src, contains('fee: 50_000, types: ["apartment", "studio", "chalet", "ground_apartment"]'));
    expect(src, contains('fee: 100_000, types: ["villa", "townhouse", "twinhouse", "duplex", "penthouse", "office", "retail"]'));
    expect(src, contains('RENT_THRESHOLD = 100_000'));
    expect(src, contains('RENT_FEE_LOW = 15_000'));
    expect(src, contains('RENT_FEE_HIGH = 50_000'));
  });
}
