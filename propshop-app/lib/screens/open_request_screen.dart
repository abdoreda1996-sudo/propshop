import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../services/api.dart';
import '../services/lang.dart';
import '../services/session.dart';
import '../theme/tokens.dart';
import '../widgets/common.dart';
import 'login_screen.dart';

/// Path 2 of the buying process: an open brief when no specific unit fits.
class OpenRequestScreen extends StatefulWidget {
  const OpenRequestScreen({super.key});

  @override
  State<OpenRequestScreen> createState() => _OpenRequestScreenState();
}

class _OpenRequestScreenState extends State<OpenRequestScreen> {
  final _budgetMax = TextEditingController();
  final _downPayment = TextEditingController();
  final _monthly = TextEditingController();
  final _note = TextEditingController();

  String _purpose = 'live';
  bool _installments = false;
  int _bedrooms = 3;

  bool _busy = false;
  String? _error;
  String? _reference;

  @override
  void dispose() {
    _budgetMax.dispose();
    _downPayment.dispose();
    _monthly.dispose();
    _note.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!context.read<SessionController>().isSignedIn) {
      final ok = await Navigator.of(
        context,
      ).push<bool>(MaterialPageRoute(builder: (_) => const LoginScreen()));
      if (ok != true) return;
    }
    if (!mounted) return;

    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final json = await context.read<Api>().createOpenRequest({
        'purpose': _purpose,
        'paymentType': _installments ? 'installments' : 'cash',
        'bedrooms': _bedrooms,
        if (_budgetMax.text.isNotEmpty)
          'budgetMax': int.tryParse(_budgetMax.text),
        if (_installments && _downPayment.text.isNotEmpty)
          'downPayment': int.tryParse(_downPayment.text),
        if (_installments && _monthly.text.isNotEmpty)
          'monthlyInstallment': int.tryParse(_monthly.text),
        if (_note.text.trim().isNotEmpty) 'note': _note.text.trim(),
      });
      if (!mounted) return;
      setState(() => _reference = json['reference'] as String?);
      context.read<SessionController>().refresh();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(
        () => _error = e.code == 'brief_too_thin'
            ? tr(
                'محتاجين على الأقل ميزانية عشان نقدر نساعدك.',
                'We need at least a budget to be able to help you.',
              )
            : tr(
                'مش قادرين نبعت الطلب دلوقتي (${e.code}).',
                'We could not send the request right now (${e.code}).',
              ),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_reference != null) {
      return Scaffold(
        appBar: AppBar(
          title: Text(tr('تم استلام طلبك', 'Request received')),
          actions: const [LangToggleButton()],
        ),
        body: EmptyState(
          title: tr(
            'وصلنا طلبك. رقمه $_reference',
            'Got it. Your request is $_reference',
          ),
          body: tr(
            'هنجمعلك الوحدات الموثقة اللي تناسب طلبك، وتتابع حالته من حسابك. مفيش أرقام بتتبادل قبل تأكيد المعاينة.',
            'We gather the verified units that fit your request, and you follow its status from your account. No phone numbers are exchanged before a viewing is confirmed.',
          ),
          action: FilledButton(
            onPressed: () => Navigator.of(context).pop(),
            child: Text(tr('تمام', 'Done')),
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(tr('ابعتلنا طلبك', 'Send us your request')),
        actions: const [LangToggleButton()],
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text(
            tr('قولنا بتدور على إيه', 'Tell us what you are looking for'),
            style: const TextStyle(
              fontSize: 22,
              height: 1.25,
              fontWeight: FontWeight.w700,
              color: AqarColors.ink900,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            tr(
              'هنجمعلك الوحدات الموثقة اللي تناسب طلبك، وتتابع حالته من حسابك. مفيش أرقام بتتبادل قبل تأكيد المعاينة.',
              'We gather the verified units that fit your request, and you follow its status from your account. No phone numbers are exchanged before a viewing is confirmed.',
            ),
            style: const TextStyle(
              fontSize: 14,
              height: 1.55,
              color: AqarColors.textMuted,
            ),
          ),
          const SizedBox(height: 22),

          DropdownButtonFormField<String>(
            initialValue: _purpose,
            decoration: InputDecoration(labelText: tr('الغرض', 'Purpose')),
            items: [
              DropdownMenuItem(
                value: 'live',
                child: Text(tr('سكن', 'To live in')),
              ),
              DropdownMenuItem(
                value: 'invest',
                child: Text(tr('استثمار', 'Investment')),
              ),
              DropdownMenuItem(
                value: 'rent_out',
                child: Text(tr('تأجير', 'To rent out')),
              ),
            ],
            onChanged: (v) => setState(() => _purpose = v ?? 'live'),
          ),
          const SizedBox(height: 12),

          TextField(
            controller: _budgetMax,
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            decoration: InputDecoration(
              labelText: tr('الميزانية لحد', 'Budget up to'),
            ),
          ),
          const SizedBox(height: 12),

          DropdownButtonFormField<int>(
            initialValue: _bedrooms,
            decoration: InputDecoration(labelText: tr('غرف النوم', 'Bedrooms')),
            items: [1, 2, 3, 4, 5]
                .map((n) => DropdownMenuItem(value: n, child: Text('$n+')))
                .toList(),
            onChanged: (v) => setState(() => _bedrooms = v ?? 3),
          ),
          const SizedBox(height: 12),

          CheckboxListTile(
            value: _installments,
            onChanged: (v) => setState(() => _installments = v ?? false),
            title: Text(tr('بالتقسيط', 'Installments')),
            controlAffinity: ListTileControlAffinity.leading,
            contentPadding: EdgeInsets.zero,
          ),
          if (_installments) ...[
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _downPayment,
                    keyboardType: TextInputType.number,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    decoration: InputDecoration(
                      labelText: tr('المقدّم', 'Down payment'),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextField(
                    controller: _monthly,
                    keyboardType: TextInputType.number,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    decoration: InputDecoration(
                      labelText: tr('القسط في الشهر', 'Installment per month'),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
          ],

          TextField(
            controller: _note,
            maxLines: 3,
            decoration: InputDecoration(
              labelText: tr(
                'أي حاجة تانية تحب نعرفها',
                'Anything else we should know',
              ),
              hintText: tr(
                'مثلاً: محتاج دور أرضي بحديقة',
                'E.g. I need a ground floor with a garden',
              ),
            ),
          ),

          const SizedBox(height: 16),
          const ContactPolicyNote(),

          if (_error != null) ...[
            const SizedBox(height: 14),
            Text(
              _error!,
              style: const TextStyle(fontSize: 13, color: AqarColors.danger),
            ),
          ],

          const SizedBox(height: 22),
          FilledButton(
            onPressed: _busy ? null : _submit,
            child: Text(
              _busy
                  ? tr('جاري الإرسال…', 'Sending…')
                  : tr('ابعت الطلب', 'Send request'),
            ),
          ),
        ],
      ),
    );
  }
}
