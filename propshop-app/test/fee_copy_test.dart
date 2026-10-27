// The fee copy, swept across the whole Dart source tree.
//
// WHY THIS EXISTS: when the fee model changed from "split between the two sides" to "each
// side pays it in full", the sanctioned strings were updated and screens that described
// the fee in their own words were missed — on the web that left the home hero and the Deal
// Room telling customers the fee was halved. Unit tests on the fee functions cannot catch
// that, because the wrong sentences do not live in those functions.
//
// So this does not test a function. It greps the Arabic UI copy for wording that
// contradicts the current model, anywhere it appears, so a new screen is covered the
// moment it is written. Mirrors src/lib/__tests__/feeCopy.test.ts on the web.

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Phrases that were true under the old shared-fee model and are false now.
///
/// Deliberately narrow: each is a claim about how the fee divides, not a general word. A
/// pattern that also matched innocent prose would train people to ignore this test.
const Map<String, String> forbidden = {
  'مقسوم بالنص': 'الرسم مش مقسوم — كل طرف بيدفعه كامل',
  'بيتقسم بالنص': 'الرسم مش مقسوم — كل طرف بيدفعه كامل',
  'نص ونص': 'كل طرف بيدفع الرسم كامل',
  'split evenly between': 'the fee is not split — each side pays it in full',
  'half each': 'each side pays the whole band fee, not half',
};

List<File> dartSources(Directory dir) {
  final out = <File>[];
  for (final entity in dir.listSync(recursive: true)) {
    if (entity is File && entity.path.endsWith('.dart')) out.add(entity);
  }
  return out;
}

void main() {
  test('no screen still describes the fee as split or shared', () {
    final offences = <String>[];
    final files = dartSources(Directory('lib'));

    for (final file in files) {
      final lines = file.readAsLinesSync();
      for (var i = 0; i < lines.length; i++) {
        forbidden.forEach((phrase, why) {
          if (lines[i].contains(phrase)) {
            offences.add('${file.path}:${i + 1} — $why\n    ${lines[i].trim()}');
          }
        });
      }
    }

    expect(offences, isEmpty, reason: 'Stale fee copy:\n${offences.join('\n')}');
  });

  test('the sweep actually works — it catches a planted phrase', () {
    // A grep-based guard that silently matches nothing is worse than no guard, because it
    // reads as passing.
    const planted = "'الرسم مقسوم بالنص بين الطرفين'";
    expect(forbidden.keys.any(planted.contains), isTrue);

    const english = 'It is split evenly between buyer and seller.';
    expect(forbidden.keys.any(english.contains), isTrue);

    // And it does not fire on the current, correct wording.
    const current = 'بيدفعه كل طرف على حدة';
    expect(forbidden.keys.any(current.contains), isFalse);
  });

  test('the sweep reaches the real source tree', () {
    // Guards the traversal itself: a broken walk returns [] and the test above would pass
    // while checking nothing.
    final files = dartSources(Directory('lib'));
    expect(files.length, greaterThan(20));
    expect(
      files.any((f) => f.path.endsWith('discover_screen.dart')),
      isTrue,
      reason: 'discover_screen.dart not swept',
    );
  });
}
