import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../services/api.dart';
import '../services/lang.dart';
import '../services/session.dart';
import '../theme/tokens.dart';
import '../widgets/common.dart';
import 'document_camera_screen.dart';

/// Identity check (KYC level 1) — the app's twin of /dashboard/verify.
///
/// Three photos — ID front, ID back, a selfie — plus the 14-digit national ID number. The
/// server reads the ID, hashes the number (it never keeps it), and raises the account to
/// trust level 1 once all three are in. Pops `true` when the account is verified.
class VerifyIdentityScreen extends StatefulWidget {
  const VerifyIdentityScreen({super.key});
  @override
  State<VerifyIdentityScreen> createState() => _VerifyIdentityScreenState();
}

class _VerifyIdentityScreenState extends State<VerifyIdentityScreen> {
  static const _steps = ['id_front', 'id_back', 'selfie'];
  final _nationalId = TextEditingController();
  final Set<String> _done = {};
  String? _busy;
  String? _error;

  @override
  void dispose() {
    _nationalId.dispose();
    super.dispose();
  }

  String _label(String t) => switch (t) {
    'id_front' => tr('وش البطاقة', 'ID card, front'),
    'id_back' => tr('ضهر البطاقة', 'ID card, back'),
    _ => tr('صورة سيلفي', 'Selfie'),
  };

  String _hint(String t) => switch (t) {
    'id_front' => tr('حط البطاقة في الإطار، والكلام واضح ومن غير انعكاس.', 'Fit the card in the frame, text sharp and without glare.'),
    'id_back' => tr('ضهر البطاقة بنفس الطريقة.', 'The back of the card, the same way.'),
    _ => tr('وشك واضح، في مكان منوّر.', 'Your face clearly, in good light.'),
  };

  /// The number as ASCII digits. An Arabic keyboard types ٠-٩, which the 14-digit check
  /// rejected, so a correct number looked wrong.
  String get _idDigits {
    const arabic = '٠١٢٣٤٥٦٧٨٩';
    return _nationalId.text.trim().split('').map((c) {
      final i = arabic.indexOf(c);
      return i >= 0 ? '$i' : c;
    }).join();
  }

  bool get _idValid => RegExp(r'^\d{14}$').hasMatch(_idDigits);

  Future<void> _capture(String type) async {
    if (!_idValid) {
      setState(() => _error = tr('اكتب الرقم القومي ١٤ رقم الأول.', 'Enter your 14-digit national ID number first.'));
      return;
    }
    final img = await takeDocumentPhoto(context, title: _label(type), hint: _hint(type), selfie: type == 'selfie');
    if (img == null || !mounted) return;
    final api = context.read<Api>();
    final session = context.read<SessionController>();
    final nav = Navigator.of(context);
    setState(() {
      _busy = type;
      _error = null;
    });
    try {
      final r = await api.uploadIdentity(type: type, nationalId: _idDigits, images: [img]);
      if (!mounted) return;
      if (r['nameMismatch'] == true) {
        setState(() => _error = tr(
              'الاسم على البطاقة مش مطابق لاسم الحساب. لو الاسم في حسابك غلط، عدّله من الإعدادات.',
              'The name on the ID does not match your account name. If your account name is wrong, change it in settings.',
            ));
        return;
      }
      setState(() => _done.add(type));
      if (r['complete'] == true) {
        await session.refresh();
        nav.pop(true);
      }
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.code == 'extraction_failed'
          ? tr('مش قادرين نقرأ الصورة. صوّرها تاني في مكان منوّر.', 'We could not read the photo. Retake it in good light.')
          : e.code == 'national_id_required'
              ? tr('الرقم القومي لازم يكون ١٤ رقم.', 'The national ID must be 14 digits.')
              : tr('حصلت مشكلة (${e.code}).', 'Something went wrong (${e.code}).'));
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(tr('وثّق هويتك', 'Verify your identity')), actions: const [LangToggleButton()]),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text(
            tr(
              'قبل ما تعرض وحدة بنتأكد من هويتك مرة واحدة بس. ده اللي بيخلّي كل إعلان على المنصة حقيقي ومن غير سماسرة.',
              'Before you list a unit we check your identity, once. That is how every listing here stays real and broker-free.',
            ),
            style: const TextStyle(fontSize: 14, height: 1.6, color: AqarColors.ink700),
          ),
          const SizedBox(height: 18),
          TextField(
            controller: _nationalId,
            keyboardType: TextInputType.number,
            maxLength: 14,
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(labelText: tr('الرقم القومي (١٤ رقم)', 'National ID number (14 digits)')),
          ),
          Text(
            tr('بنحفظه مشفّر باتجاه واحد، يعني الرقم نفسه مش متخزّن عندنا.', 'We store a one-way hash of it. The number itself is never kept.'),
            style: const TextStyle(fontSize: 12, color: AqarColors.textMuted),
          ),
          const SizedBox(height: 22),
          Text(
            tr('٣ صور', '3 photos'),
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AqarColors.ink900),
          ),
          const SizedBox(height: 4),
          const Divider(),
          // A numbered list of three rows, each saying what is left to do.
          for (final (i, t) in _steps.indexed)
            PlainRow(
              label: '${i + 1}. ${_label(t)}',
              detail: _hint(t),
              onTap: _busy != null ? null : () => _capture(t),
              trailing: _busy == t
                  ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                  : Text(
                      _done.contains(t) ? tr('اتبعتت', 'Sent') : tr('صوّر', 'Take photo'),
                      style: TextStyle(
                        fontSize: 13.5,
                        fontWeight: FontWeight.w600,
                        color: _done.contains(t) ? AqarColors.ok700 : AqarColors.brand500,
                      ),
                    ),
            ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Text(_error!, style: const TextStyle(fontSize: 13, height: 1.5, color: AqarColors.danger, fontWeight: FontWeight.w600)),
            ),
        ],
      ),
    );
  }
}
