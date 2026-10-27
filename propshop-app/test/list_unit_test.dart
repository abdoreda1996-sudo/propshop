import 'package:flutter_test/flutter_test.dart';
import 'package:aqarsale_app/screens/list_unit_screen.dart';

void main() {
  group('coveredRoomsFromValidation', () {
    test('no rooms_missing block means every room is covered', () {
      final v = {'blocks': <Map<String, dynamic>>[], 'warnings': []};
      expect(coveredRoomsFromValidation(v), ['living', 'bedroom', 'kitchen', 'bathroom', 'facade', 'view']);
    });

    test('the missing rooms are taken out', () {
      final v = {
        'blocks': [
          {'code': 'photos_below_minimum', 'messageEn': 'At least 6 photos. You have 2.'},
          {'code': 'rooms_missing', 'messageEn': 'Missing photos for: kitchen, bathroom, facade, view'},
        ],
      };
      expect(coveredRoomsFromValidation(v), ['living', 'bedroom']);
    });

    test('null validation covers nothing', () {
      expect(coveredRoomsFromValidation(null), isEmpty);
    });
  });

  group('coveredRoomsFromMedia', () {
    test('ticks rooms with in-app or photographer photos, in checklist order', () {
      final j = {
        'media': [
          {'id': 'a', 'room': 'kitchen', 'kind': 'photo', 'source': 'in_app'},
          {'id': 'b', 'room': 'living', 'kind': 'photo', 'source': 'photographer'},
          {'id': 'c', 'room': 'kitchen', 'kind': 'photo', 'source': 'in_app'},
        ],
      };
      expect(coveredRoomsFromMedia(j), ['living', 'kitchen']);
    });

    test('gallery uploads and photos without a room do not count', () {
      final j = {
        'media': [
          {'id': 'a', 'room': 'bedroom', 'source': 'upload'},
          {'id': 'b', 'room': null, 'source': 'in_app'},
          {'id': 'c', 'room': 'not_a_room', 'source': 'in_app'},
        ],
      };
      expect(coveredRoomsFromMedia(j), isEmpty);
    });

    test('empty or missing payload covers nothing', () {
      expect(coveredRoomsFromMedia({'media': []}), isEmpty);
      expect(coveredRoomsFromMedia(null), isEmpty);
    });
  });

  test('westernDigits converts Arabic-Indic digits', () {
    expect(westernDigits('٣٥٠ م'), '350 م');
  });
}
