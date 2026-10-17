import SwiftUI
import PassKit
import CoreImage.CIFilterBuiltins

// «سبق بلس» — المعاينة الداخلية (مسؤول النظام فقط، مرآة sabq.org/plus-preview).
//
// التجربة الكاملة: بطاقة العضوية v2 (كحلي سبق المعتمد، الرصيد بالريال
// أولاً + رحلة الفئات الخمس)، كتالوج قسائم محاكاة ولاء ون، استبدال حقيقي
// يخصم من المحفظة بموافقة إلزامية على الشروط، تهنئة ببطاقة قسيمة بنفسجية
// برمز QR حقيقي وزر Apple Wallet (نفس مسار بطاقة الصحافة)، سجل
// الاستبدالات مع إعادة تنزيل البطاقة وإزالة القسيمة، وملخص الشروط.
//
// المدخل: بلاطة admin في SettingsView → SabqPlusRoute → هنا. الخادم
// بدوره يرفض غير المسؤول بـ 404، فالبوابة مزدوجة.

struct SabqPlusView: View {
    @Environment(AuthStore.self) private var authStore
    @State private var loader = SabqPlusLoader()

    // تدفق الاستبدال
    @State private var confirmReward: PlusReward?
    @State private var agreedToTerms = false
    @State private var isRedeeming = false
    @State private var celebrationVoucher: PlusVoucher?

    // بطاقة Wallet
    @State private var pendingPass: PKPass?
    @State private var showAddPassSheet = false
    @State private var walletBusyId: String?
    /// أرقام البطاقات المثبّتة فعلاً في Wallet (عبر PKPassLibrary + entitlement
    /// pass-type-identifiers) — تتيح حالة «مضافة ✓» والحذف من داخل التطبيق.
    @State private var installedSerials: Set<String> = []

    // إزالة قسيمة
    @State private var removalTarget: PlusRedemption?
    @State private var isRemoving = false

    @State private var errorMessage: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: SabqLayout.sectionGap) {
                previewNote
                memberCard
                earnSection
                catalogSection
                historySection
                termsSection
                Text("نموذج محاكاة داخلي لتجربة «سبق بلس × ولاء ون» — أسماء الشركاء تجريبية والخصم من رصيدك فعلي")
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .frame(maxWidth: .infinity)
                    .multilineTextAlignment(.center)
            }
            .padding(SabqLayout.pageMargin)
        }
        .background(SabqTheme.background.ignoresSafeArea())
        .navigationTitle("سبق بلس")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await loader.load()
            refreshInstalledPasses()
        }
        .refreshable {
            await loader.load()
            refreshInstalledPasses()
        }
        .environment(\.layoutDirection, .rightToLeft)
        .sheet(item: $confirmReward) { reward in
            redeemConfirmSheet(reward)
                .presentationDetents([.medium, .large])
                .environment(\.layoutDirection, .rightToLeft)
        }
        .fullScreenCover(item: $celebrationVoucher) { voucher in
            celebrationScreen(voucher)
                .environment(\.layoutDirection, .rightToLeft)
        }
        .sheet(isPresented: $showAddPassSheet) {
            if let pass = pendingPass {
                PKAddPassesRepresentable(pass: pass) { _ in
                    showAddPassSheet = false
                    pendingPass = nil
                    refreshInstalledPasses()
                }
            }
        }
        .alert("إزالة القسيمة", isPresented: Binding(
            get: { removalTarget != nil },
            set: { if !$0 { removalTarget = nil } }
        )) {
            Button("إزالة واسترجاع النقاط", role: .destructive) {
                if let target = removalTarget { Task { await removeRedemption(target) } }
            }
            Button("إلغاء", role: .cancel) { removalTarget = nil }
        } message: {
            Text("ستُرجع \(removalTarget.map { formatPoints($0.pointsSpent) } ?? "") نقطة إلى رصيدك، وستُحذف بطاقتها من Apple Wallet إن كانت مضافة.")
        }
        .alert("تنبيه", isPresented: Binding(
            get: { errorMessage != nil },
            set: { if !$0 { errorMessage = nil } }
        )) {
            Button("حسناً", role: .cancel) { errorMessage = nil }
        } message: {
            Text(errorMessage ?? "")
        }
    }

    // MARK: - شريط المعاينة

    private var previewNote: some View {
        Text("⚠ معاينة داخلية — تظهر لمسؤول النظام فقط ولا تمثل إطلاقاً رسمياً")
            .font(SabqType.metaEmphasis.font)
            .foregroundStyle(SabqTheme.warning)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .padding(.vertical, SabqLayout.space8)
            .padding(.horizontal, SabqLayout.space12)
            .background(SabqTheme.surfaceMuted, in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
    }

    // MARK: - بطاقة العضوية (v2 — كحلي سبق المعتمد)

    /// لون الهوية الوحيد للبطاقة: كحلي سبق مسطح، بلا تدرج ولا توهج.
    private let cardNavy = Color(red: 0.063, green: 0.137, blue: 0.227)
    /// لون ولاء ون المسطح لبطاقة القسيمة؛ داكن بما يكفي لنص أبيض.
    private let walaDeep = Color(red: 0.373, green: 0.310, blue: 0.820)
    private let onCardSecondary = SabqTheme.onAction.opacity(0.78)

    private var memberCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            let name = authStore.currentUser?.displayName ?? "مسؤول النظام"
            Text(name)
                .sabqText(SabqType.sectionHeading)
                .foregroundStyle(SabqTheme.onAction)
            Text("مسؤول النظام · حساب التجربة")
                .font(SabqType.meta.font)
                .foregroundStyle(onCardSecondary)
                .padding(.bottom, SabqLayout.space16)

            if let summary = loader.summary {
                HStack(alignment: .firstTextBaseline, spacing: SabqLayout.space8) {
                    Text(String(format: "%.2f", summary.sarValue))
                        .font(SabqFonts.headline(size: 40))
                        .foregroundStyle(SabqTheme.onAction)
                        .monospacedDigit()
                        .minimumScaleFactor(0.7)
                        .lineLimit(1)
                    Text("ر.س")
                        .font(SabqType.rowTitle.font)
                        .foregroundStyle(onCardSecondary)
                    Text("\(formatPoints(summary.totalPoints)) نقطة")
                        .font(SabqType.metaEmphasis.font)
                        .foregroundStyle(onCardSecondary)
                        .monospacedDigit()
                }
                Text("كل \(summary.pointsPerSar) نقطة = 1 ريال سعودي · الاستبدال عبر شركاء ولاء ون")
                    .font(SabqType.tag.font)
                    .foregroundStyle(onCardSecondary)
                    .padding(.top, SabqLayout.space4)

                tierJourney(summary)
                    .padding(.top, SabqLayout.space16)

                statsPanel(summary)
                    .padding(.top, SabqLayout.space12)

                Group {
                    if let next = summary.nextTier {
                        Text("يفصلك \(formatPoints(summary.pointsToNext)) نقطة عن فئة «\(next.nameAr)»")
                    } else {
                        Text("وصلت لأعلى فئة — يُحتسب مضاعف السفير على كل مكافآت التوقعات")
                    }
                }
                .font(SabqType.tag.font)
                .foregroundStyle(SabqTheme.onAction)
                .padding(.vertical, SabqLayout.space8)
                .padding(.horizontal, SabqLayout.space12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(SabqTheme.onAction.opacity(0.10), in: RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous))
                .padding(.top, SabqLayout.space12)
            } else if loader.isLoading {
                ProgressView()
                    .tint(SabqTheme.onAction)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, SabqLayout.space40)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(SabqLayout.space24)
        .background(cardNavy, in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
    }

    private func tierJourney(_ summary: PlusSummary) -> some View {
        HStack(spacing: SabqLayout.space8) {
            Text(summary.tier.nameAr)
                .font(SabqType.tag.font)
                .foregroundStyle(SabqTheme.onAction)
                .padding(.vertical, SabqLayout.space4)
                .padding(.horizontal, SabqLayout.space12)
                .background(SabqTheme.onAction.opacity(0.16), in: Capsule())
            ForEach(LoyaltyTiers.all) { tier in
                Circle()
                    .fill(tier.level <= summary.tier.level ? tier.color : SabqTheme.onAction.opacity(0.2))
                    .frame(
                        width: tier.level == summary.tier.level ? 12 : 8,
                        height: tier.level == summary.tier.level ? 12 : 8
                    )
            }
            Text(summary.tier.level >= 5 ? "5/5" : "\(summary.tier.level)/5")
                .font(SabqType.tag.font)
                .foregroundStyle(onCardSecondary)
                .monospacedDigit()
                .environment(\.layoutDirection, .leftToRight)
        }
    }

    private func statsPanel(_ summary: PlusSummary) -> some View {
        VStack(spacing: 0) {
            statRow("نقاط مدى الحياة", formatPoints(summary.lifetimePoints), divider: false)
            statRow("نقاط هذا الشهر", "+\(formatPoints(summary.monthPoints))")
            statRow("مضاعف التوقعات", "×\(summary.predictionMultiplier.clean)")
        }
        .padding(.vertical, SabqLayout.space4)
        .padding(.horizontal, SabqLayout.space16)
        .background(SabqTheme.onAction.opacity(0.08), in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
    }

    private func statRow(_ label: String, _ value: String, divider: Bool = true) -> some View {
        VStack(spacing: 0) {
            if divider {
                Rectangle().fill(SabqTheme.onAction.opacity(0.12)).frame(height: 1)
            }
            HStack {
                Text(label)
                    .font(SabqType.meta.font)
                    .foregroundStyle(onCardSecondary)
                Spacer()
                Text(value)
                    .font(SabqType.button.font)
                    .foregroundStyle(SabqTheme.onAction)
                    .monospacedDigit()
                    .environment(\.layoutDirection, .leftToRight)
            }
            .padding(.vertical, SabqLayout.space8)
        }
    }

    // MARK: - كيف تكسب

    private var earnSection: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            sectionTitle("كيف تكسب النقاط")
            Text("تُمنح النقاط تلقائياً أثناء استخدامك سبق — لا حاجة لأي خطوة إضافية.")
                .sabqText(SabqType.excerpt)
                .foregroundStyle(SabqTheme.textSecondary)
            let earns: [(String, String, String)] = [
                ("book", "قراءة مقال", "+2"),
                ("book.closed", "قراءة عميقة", "+3"),
                ("bubble.right", "تعليق", "+1"),
                ("arrow.turn.down.left", "دخول يومي", "+5 × السلسلة"),
                ("trophy", "فوز توقّع رياضي", "حسب البركة"),
            ]
            LazyVGrid(columns: SabqGrid.adaptive(spacing: SabqLayout.space8), spacing: SabqLayout.space8) {
                ForEach(earns, id: \.1) { icon, label, value in
                    HStack(spacing: SabqLayout.space8) {
                        Image(systemName: icon)
                            .font(SabqType.excerpt.font)
                            .foregroundStyle(SabqTheme.primary)
                            .accessibilityHidden(true)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(label)
                                .font(SabqType.metaEmphasis.font)
                                .foregroundStyle(SabqTheme.textPrimary)
                            Text(value)
                                .font(SabqType.tag.font)
                                .foregroundStyle(SabqTheme.primary)
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(SabqLayout.space12)
                    .background(SabqTheme.surfaceMuted, in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
                    .accessibilityElement(children: .combine)
                }
            }
            Text("القيم الحالية للإنتاج — جدول الاكتساب الجديد (المكافئ للريال) قيد الاعتماد.")
                .font(SabqType.meta.font)
                .foregroundStyle(SabqTheme.textSecondary)
        }
    }

    // MARK: - الكتالوج

    private var catalogSection: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            HStack(spacing: SabqLayout.space8) {
                sectionTitle("استبدل نقاطك")
                Text("W بالتعاون مع ولاء ون")
                    .font(SabqType.tag.font)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .padding(.vertical, SabqLayout.space4)
                    .padding(.horizontal, SabqLayout.space8)
                    .background(SabqTheme.surfaceMuted, in: RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous))
            }
            Text("بعد تأكيد الاستبدال تصدر قسيمتك فوراً برمز QR ويمكن إضافتها إلى Apple Wallet. أسماء الشركاء تجريبية للمحاكاة.")
                .sabqText(SabqType.excerpt)
                .foregroundStyle(SabqTheme.textSecondary)

            // صفوف بعرض كامل لا شبكة: عمودان بالعربية على عرض الجوال
            // يشوّهان المحاذاة (ارتفاعات متفاوتة بحسب التفاف نص العرض).
            VStack(spacing: 0) {
                ForEach(Array((loader.catalog?.rewards ?? []).enumerated()), id: \.element.id) { index, reward in
                    if index > 0 {
                        Rectangle().fill(SabqTheme.separator).frame(height: 1)
                    }
                    rewardCard(reward)
                }
            }
        }
    }

    private func rewardCard(_ reward: PlusReward) -> some View {
        let balance = loader.catalog?.balance ?? 0
        let affordable = balance >= reward.pointsCost
        return HStack(alignment: .center, spacing: SabqLayout.space12) {
            partnerBadge(category: reward.category, size: 44, iconSize: 18)

            VStack(alignment: .leading, spacing: SabqLayout.space4) {
                Text(reward.partnerName)
                    .font(SabqType.rowTitle.font)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .lineLimit(1)
                Text(reward.offer)
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
                Text(reward.category + " · ولاء ون")
                    .font(SabqType.tag.font)
                    .foregroundStyle(SabqTheme.textTertiary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            VStack(alignment: .center, spacing: SabqLayout.space8) {
                VStack(spacing: 0) {
                    Text("\(formatPoints(reward.pointsCost))")
                        .font(SabqType.button.font)
                        .foregroundStyle(SabqTheme.textPrimary)
                        .monospacedDigit()
                    Text("نقطة ≈ \(reward.sarValue.clean) ر.س")
                        .font(SabqType.tag.font)
                        .foregroundStyle(SabqTheme.textSecondary)
                        .monospacedDigit()
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                }
                Button {
                    agreedToTerms = false
                    confirmReward = reward
                } label: {
                    Text(affordable ? "استبدل" : "لا يكفي")
                        .font(SabqType.metaEmphasis.font)
                        .foregroundStyle(affordable ? SabqTheme.onAction : SabqTheme.disabledInk)
                        .frame(maxWidth: .infinity, minHeight: SabqLayout.touchTarget)
                        .background(
                            affordable ? SabqTheme.actionFill : SabqTheme.disabledFill,
                            in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                        )
                }
                .buttonStyle(.plain)
                .disabled(!affordable || isRedeeming)
            }
            .frame(width: 96)
        }
        .padding(.vertical, SabqLayout.space16)
    }

    /// «شعار» الشريك: أيقونة الفئة في مربع هادئ — الشركاء تجريبيون فلا
    /// شعارات حقيقية. عند تكامل ولاء ون تُستبدل بصور الكتالوج.
    private func partnerBadge(category: String, size: CGFloat, iconSize: CGFloat) -> some View {
        Image(systemName: categoryIcon(for: category))
            .font(.system(size: iconSize, weight: .regular))
            .foregroundStyle(SabqTheme.textSecondary)
            .frame(width: size, height: size)
            .background(SabqTheme.surfaceMuted, in: RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous))
            .accessibilityHidden(true)
    }

    private func categoryIcon(for category: String) -> String {
        switch category {
        case "مقاهٍ": return "cup.and.saucer.fill"
        case "صحة": return "cross.case.fill"
        case "مطاعم": return "fork.knife"
        case "توصيل": return "car.fill"
        case "ترفيه": return "film.fill"
        case "تسوق": return "book.fill"
        case "اتصالات": return "antenna.radiowaves.left.and.right"
        case "أزياء": return "bag.fill"
        default: return "gift.fill"
        }
    }

    // MARK: - نافذة التأكيد

    private func redeemConfirmSheet(_ reward: PlusReward) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space16) {
            Text("تأكيد الاستبدال")
                .sabqText(SabqType.leadTitle)
                .foregroundStyle(SabqTheme.textPrimary)
                .accessibilityAddTraits(.isHeader)
            Text("\(reward.partnerName) — \(reward.offer)")
                .sabqText(SabqType.excerpt)
                .foregroundStyle(SabqTheme.textSecondary)

            VStack(spacing: 0) {
                confirmRow("قيمة القسيمة", reward.valueLabel)
                confirmRow("التكلفة", "\(formatPoints(reward.pointsCost)) نقطة")
                let after = (loader.catalog?.balance ?? 0) - reward.pointsCost
                confirmRow("رصيدك بعد الاستبدال", "\(formatPoints(after)) نقطة (≈ \(String(format: "%.2f", Double(after) / 500)) ر.س)")
            }

            Text("⚠ بعد التأكيد تسري شروط وأحكام ولاء ون ولا يمكن التراجع أو استرداد النقاط.")
                .sabqText(SabqType.meta)
                .foregroundStyle(SabqTheme.textPrimary)
                .padding(SabqLayout.space12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(SabqTheme.surfaceMuted, in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))

            Toggle(isOn: $agreedToTerms) {
                Text("أوافق على شروط استخدام سبق بلس وشروط وأحكام ولاء ون")
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textPrimary)
            }
            .tint(SabqTheme.actionFill)

            Button {
                Task { await redeem(reward) }
            } label: {
                HStack(spacing: SabqLayout.space8) {
                    if isRedeeming { ProgressView().tint(SabqTheme.onAction) }
                    Text(isRedeeming ? "جارٍ الاستبدال…" : "تأكيد الاستبدال")
                        .font(SabqType.button.font)
                }
                .foregroundStyle(agreedToTerms ? SabqTheme.onAction : SabqTheme.disabledInk)
                .frame(maxWidth: .infinity, minHeight: SabqLayout.controlHeight)
                .background(agreedToTerms ? SabqTheme.actionFill : SabqTheme.disabledFill,
                            in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
            }
            .buttonStyle(.plain)
            .disabled(!agreedToTerms || isRedeeming)

            Button("إلغاء") { confirmReward = nil }
                .font(SabqType.button.font)
                .foregroundStyle(SabqTheme.primary)
                .frame(maxWidth: .infinity, minHeight: SabqLayout.touchTarget)

            Spacer(minLength: 0)
        }
        .padding(SabqLayout.space24)
        .background(SabqTheme.background.ignoresSafeArea())
    }

    private func confirmRow(_ label: String, _ value: String) -> some View {
        HStack(spacing: SabqLayout.space12) {
            Text(label)
                .font(SabqType.meta.font)
                .foregroundStyle(SabqTheme.textSecondary)
            Spacer()
            Text(value)
                .font(SabqType.metaEmphasis.font)
                .foregroundStyle(SabqTheme.textPrimary)
                .monospacedDigit()
                .multilineTextAlignment(.trailing)
        }
        .padding(.vertical, SabqLayout.space12)
        .overlay(alignment: .bottom) {
            Rectangle().fill(SabqTheme.separator).frame(height: 1)
        }
    }

    // MARK: - التهنئة + بطاقة القسيمة

    private func celebrationScreen(_ voucher: PlusVoucher) -> some View {
        ScrollView {
            VStack(spacing: SabqLayout.space16) {
                Image(systemName: "checkmark.seal")
                    .font(SabqFonts.app(size: 40, weight: .regular))
                    .foregroundStyle(SabqTheme.success)
                    .padding(.top, SabqLayout.space32)
                    .accessibilityHidden(true)
                Text("مبروك! تم الاستبدال")
                    .sabqText(SabqType.leadTitle)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .accessibilityAddTraits(.isHeader)
                Text("قسيمتك من \(voucher.partnerName) جاهزة — أبرِزها عند الشريك أو أضفها لمحفظتك")
                    .sabqText(SabqType.excerpt)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .multilineTextAlignment(.center)

                voucherPassCard(voucher)

                Button {
                    Task { await addToWallet(redemptionId: voucher.redemptionId) }
                } label: {
                    HStack(spacing: SabqLayout.space8) {
                        if walletBusyId == voucher.redemptionId {
                            ProgressView().tint(SabqTheme.onAction)
                        } else {
                            Image(systemName: "wallet.pass.fill")
                        }
                        Text("أضفها إلى Apple Wallet")
                            .font(SabqType.button.font)
                    }
                    .foregroundStyle(SabqTheme.onAction)
                    .frame(maxWidth: .infinity, minHeight: SabqLayout.controlHeight)
                    // زر Apple Wallet أسود بحسب إرشادات Apple لعلامة المحفظة.
                    .background(Color.black, in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
                }
                .buttonStyle(.plain)
                .disabled(walletBusyId != nil)

                Text("خُصمت \(formatPoints(voucher.pointsSpent)) نقطة · رصيدك الجديد \(formatPoints(loader.catalog?.balance ?? 0)) نقطة")
                    .font(SabqType.meta.font)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .monospacedDigit()
                    .multilineTextAlignment(.center)

                Button("تم") { celebrationVoucher = nil }
                    .font(SabqType.button.font)
                    .foregroundStyle(SabqTheme.primary)
                    .frame(maxWidth: .infinity, minHeight: SabqLayout.controlHeight)
                    .overlay(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                        .stroke(SabqTheme.outline, lineWidth: 1))
                    .padding(.bottom, SabqLayout.space24)
            }
            .padding(SabqLayout.space24)
        }
        .background(SabqTheme.background.ignoresSafeArea())
        .environment(\.layoutDirection, .rightToLeft)
        // نافذة PassKit تُعلَّق هنا داخل الغطاء الكامل — تعليقها على الشاشة
        // الأساسية المغطاة يفشل صامتاً (الزر يرمش) ثم تنبثق فجأة بعد
        // إغلاق التهنئة.
        .sheet(isPresented: $showAddPassSheet) {
            if let pass = pendingPass {
                PKAddPassesRepresentable(pass: pass) { _ in
                    showAddPassSheet = false
                    pendingPass = nil
                }
            }
        }
    }

    private func voucherPassCard(_ voucher: PlusVoucher) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            HStack(spacing: SabqLayout.space12) {
                Image(systemName: categoryIcon(for: voucher.category ?? ""))
                    .font(.system(size: 17, weight: .regular))
                    .foregroundStyle(SabqTheme.onAction)
                    .frame(width: 40, height: 40)
                    .background(SabqTheme.onAction.opacity(0.16), in: RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous))
                    .accessibilityHidden(true)
                Text(voucher.partnerName)
                    .font(SabqType.rowTitle.font)
                    .foregroundStyle(SabqTheme.onAction)
            }
            Text("\(voucher.offer) · \(voucher.valueLabel)")
                .font(SabqType.meta.font)
                .foregroundStyle(SabqTheme.onAction.opacity(0.85))

            VStack(spacing: SabqLayout.space8) {
                if let qr = generateQR(from: voucher.code) {
                    Image(uiImage: qr)
                        .interpolation(.none)
                        .resizable()
                        .frame(width: 140, height: 140)
                        .accessibilityLabel("رمز QR")
                }
                Text(voucher.code)
                    .font(.system(.footnote, design: .monospaced).weight(.semibold))
                    .kerning(2)
                    .foregroundStyle(Color.black)
                    .environment(\.layoutDirection, .leftToRight)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, SabqLayout.space16)
            // الرمز يحتاج خلفية بيضاء ثابتة ليُقرأ في الوضعين.
            .background(Color.white, in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))

            HStack {
                Text("صالحة حتى \(formatDate(voucher.expiresAt))")
                Spacer()
                Text("سبق بلس × ولاء ون")
            }
            .font(SabqType.tag.font)
            .foregroundStyle(SabqTheme.onAction.opacity(0.85))
        }
        .padding(SabqLayout.space16)
        .background(walaDeep, in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
    }

    // MARK: - السجل

    private var historySection: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            HStack {
                sectionTitle("سجل استبدالاتي")
                Spacer()
                if !installedSerials.isEmpty {
                    Button {
                        cleanupWalletPasses()
                    } label: {
                        Label("تنظيف Wallet (\(installedSerials.count))", systemImage: "wallet.pass")
                            .font(SabqType.metaEmphasis.font)
                            .foregroundStyle(SabqTheme.primary)
                            .frame(minHeight: SabqLayout.touchTarget)
                    }
                    .buttonStyle(.plain)
                }
            }
            if loader.redemptions.isEmpty {
                Text("لا توجد استبدالات بعد — جرّب استبدال أول قسيمة ✨")
                    .sabqText(SabqType.excerpt)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, SabqLayout.space24)
                    .padding(.horizontal, SabqLayout.space16)
                    .background(SabqTheme.surfaceMuted, in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(loader.redemptions.enumerated()), id: \.element.id) { index, item in
                        if index > 0 {
                            Rectangle().fill(SabqTheme.separator).frame(height: 1)
                        }
                        redemptionRow(item)
                    }
                }
            }
        }
    }

    private func redemptionRow(_ item: PlusRedemption) -> some View {
        HStack(spacing: SabqLayout.space8) {
            partnerBadge(category: item.category ?? "", size: 36, iconSize: 15)
            VStack(alignment: .leading, spacing: 2) {
                Text(item.partnerName ?? "قسيمة")
                    .font(SabqType.rowTitle.font)
                    .foregroundStyle(SabqTheme.textPrimary)
                HStack(spacing: SabqLayout.space8) {
                    if let code = item.code {
                        Text(code)
                            .font(.system(.caption, design: .monospaced))
                            .environment(\.layoutDirection, .leftToRight)
                    }
                    if let date = item.redeemedAt {
                        Text(formatDate(date))
                            .font(SabqType.tag.font)
                    }
                }
                .foregroundStyle(SabqTheme.textSecondary)
            }
            Spacer(minLength: 0)
            Text("−\(formatPoints(item.pointsSpent))")
                .font(SabqType.metaEmphasis.font)
                .foregroundStyle(SabqTheme.danger)
                .monospacedDigit()
                .environment(\.layoutDirection, .leftToRight)
            if item.code != nil {
                let installed = installedSerials.contains(walletSerial(for: item.id))
                Button {
                    Task { await addToWallet(redemptionId: item.id) }
                } label: {
                    Group {
                        if walletBusyId == item.id {
                            ProgressView()
                        } else {
                            Image(systemName: installed ? "wallet.pass.fill" : "wallet.pass")
                                .font(SabqType.excerpt.font)
                                .foregroundStyle(installed ? SabqTheme.success : SabqTheme.primary)
                        }
                    }
                    .frame(width: SabqLayout.touchTarget, height: SabqLayout.touchTarget)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(walletBusyId != nil)
                .accessibilityLabel("Apple Wallet")
            }
            Button {
                removalTarget = item
            } label: {
                Image(systemName: "trash")
                    .font(SabqType.excerpt.font)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .frame(width: SabqLayout.touchTarget, height: SabqLayout.touchTarget)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(isRemoving)
            .accessibilityLabel("إزالة القسيمة")
        }
        .padding(.vertical, SabqLayout.space8)
    }

    // MARK: - الشروط

    private var termsSection: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            sectionTitle("الإرشادات وشروط الاستخدام")
            Text("ملخص توضيحي — الصياغة القانونية النهائية تُعتمد قبل الإطلاق الرسمي.")
                .sabqText(SabqType.meta)
                .foregroundStyle(SabqTheme.textSecondary)
            VStack(spacing: 0) {
                termItem("اكتساب النقاط وأسقفها",
                         "تُمنح النقاط من قراءة المحتوى والتفاعل والدخول اليومي والتوقعات الرياضية وفق الجدول المعلن، وبأسقف يومية مضادة لإساءة الاستخدام.")
                termItem("الاستبدال عبر ولاء ون",
                         "عند تأكيد الاستبدال تُخصم النقاط فوراً وتصدر القسيمة. بعد التأكيد تسري شروط وأحكام ولاء ون ولا يمكن التراجع أو استرداد النقاط.")
                termItem("صلاحية النقاط والقسائم",
                         "نقاط سبق بلس لا تنتهي ما دام حسابك نشطاً. القسائم الصادرة عبر ولاء ون تنتهي بعد 12 شهراً من الإصدار ما لم يُذكر خلاف ذلك.")
                termItem("حدود المسؤولية",
                         "مسؤولية سبق تقتصر على صحة خصم النقاط وإصدار القسيمة. تأخر الشريك أو تغيير عروضه يخضع لشروط ولاء ون والشريك، وفي حال تعذر الإصدار تُعاد النقاط كاملة.")
                termItem("الدعم والنزاعات",
                         "لمشاكل النقاط: دعم سبق خلال 15 يوماً من العملية. لمشاكل استخدام القسيمة لدى الشريك: تُحال لدعم ولاء ون مع رقم المرجع.",
                         isLast: true)
            }
        }
    }

    private func termItem(_ title: String, _ body: String, isLast: Bool = false) -> some View {
        VStack(spacing: 0) {
            DisclosureGroup {
                Text(body)
                    .sabqText(SabqType.excerpt)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, SabqLayout.space8)
            } label: {
                Text(title)
                    .font(SabqType.rowTitle.font)
                    .foregroundStyle(SabqTheme.textPrimary)
            }
            .padding(.vertical, SabqLayout.space12)
            .frame(minHeight: SabqLayout.touchTarget)
            .tint(SabqTheme.textSecondary)
            if !isLast {
                Rectangle().fill(SabqTheme.separator).frame(height: 1)
            }
        }
    }

    // MARK: - الأفعال

    private func redeem(_ reward: PlusReward) async {
        guard !isRedeeming else { return }
        isRedeeming = true
        defer { isRedeeming = false }
        do {
            let response = try await APIClient.shared.redeemPlusReward(id: reward.id)
            confirmReward = nil
            await loader.load()
            if let voucher = response.voucher {
                celebrationVoucher = voucher
            }
        } catch let APIError.apiMessage(msg) {
            confirmReward = nil
            errorMessage = msg
        } catch {
            confirmReward = nil
            errorMessage = "تعذر الاستبدال. حاول مرة أخرى."
        }
    }

    private func addToWallet(redemptionId: String) async {
        guard walletBusyId == nil else { return }
        walletBusyId = redemptionId
        defer { walletBusyId = nil }
        do {
            let data = try await APIClient.shared.downloadPlusVoucherPass(redemptionId: redemptionId)
            let pass = try PKPass(data: data)
            await MainActor.run {
                pendingPass = pass
                showAddPassSheet = true
            }
        } catch let APIError.apiMessage(msg) {
            errorMessage = msg
        } catch {
            errorMessage = "تعذر إنشاء بطاقة المحفظة."
        }
    }

    private func removeRedemption(_ item: PlusRedemption) async {
        guard !isRemoving else { return }
        isRemoving = true
        defer { isRemoving = false }
        do {
            try await APIClient.shared.removePlusRedemption(id: item.id)
            removalTarget = nil
            removeWalletPass(serial: walletSerial(for: item.id))
            await loader.load()
        } catch {
            removalTarget = nil
            errorMessage = "تعذر إزالة القسيمة."
        }
    }

    // MARK: - إدارة بطاقات Wallet من داخل التطبيق (PKPassLibrary)
    //
    // بفضل entitlement pass-type-identifiers يستطيع التطبيق قراءة وحذف
    // البطاقات الصادرة بمعرّفات فريق سبق — فلا يحتاج المستخدم مطاردة زر
    // «إزالة البطاقة» في تطبيق Wallet.

    /// الرقم التسلسلي المطبوع في البطاقة — نفس الاشتقاق في الخادم.
    private func walletSerial(for redemptionId: String) -> String {
        "SABQ-PLUS-" + redemptionId.replacingOccurrences(of: "-", with: "").prefix(10).uppercased()
    }

    private func refreshInstalledPasses() {
        let library = PKPassLibrary()
        installedSerials = Set(
            library.passes()
                .filter { $0.serialNumber.hasPrefix("SABQ-PLUS-") }
                .map(\.serialNumber)
        )
    }

    private func removeWalletPass(serial: String) {
        let library = PKPassLibrary()
        if let pass = library.passes().first(where: { $0.serialNumber == serial }) {
            library.removePass(pass)
        }
        refreshInstalledPasses()
    }

    /// حذف كل بطاقات قسائم سبق بلس المتراكمة من Wallet دفعة واحدة.
    private func cleanupWalletPasses() {
        let library = PKPassLibrary()
        let plusPasses = library.passes().filter { $0.serialNumber.hasPrefix("SABQ-PLUS-") }
        for pass in plusPasses {
            library.removePass(pass)
        }
        refreshInstalledPasses()
        errorMessage = "أُزيلت \(plusPasses.count) بطاقة من Apple Wallet."
    }

    // MARK: - أدوات

    private func sectionTitle(_ text: String) -> some View {
        Text(text)
            .sabqText(SabqType.sectionHeading)
            .foregroundStyle(SabqTheme.textPrimary)
            .accessibilityAddTraits(.isHeader)
    }

    private func formatPoints(_ value: Int) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.locale = Locale(identifier: "en_US")
        return formatter.string(from: NSNumber(value: value)) ?? "\(value)"
    }

    private func formatDate(_ iso: String) -> String {
        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        var date = parser.date(from: iso)
        if date == nil {
            parser.formatOptions = [.withInternetDateTime]
            date = parser.date(from: iso)
        }
        guard let date else { return iso }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "ar_SA@calendar=gregorian;numbers=latn")
        formatter.dateFormat = "d MMMM yyyy"
        return formatter.string(from: date)
    }

    private func generateQR(from string: String) -> UIImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(string.utf8)
        guard let output = filter.outputImage else { return nil }
        let scaled = output.transformed(by: CGAffineTransform(scaleX: 10, y: 10))
        let context = CIContext()
        guard let cgImage = context.createCGImage(scaled, from: scaled.extent) else { return nil }
        return UIImage(cgImage: cgImage)
    }
}

private extension Double {
    /// ×1.5 بدل ×1.50000 — عرض نظيف للمضاعف.
    var clean: String {
        truncatingRemainder(dividingBy: 1) == 0
            ? String(format: "%.0f", self)
            : String(format: "%.1f", self)
    }
}

// MARK: - Loader

@Observable
final class SabqPlusLoader {
    var summary: PlusSummary?
    var catalog: PlusCatalog?
    var redemptions: [PlusRedemption] = []
    var isLoading = false

    func load() async {
        isLoading = summary == nil
        defer { isLoading = false }
        async let summaryTask = try? APIClient.shared.fetchPlusSummary()
        async let catalogTask = try? APIClient.shared.fetchPlusCatalog()
        async let redemptionsTask = try? APIClient.shared.fetchPlusRedemptions()
        let (s, c, r) = await (summaryTask, catalogTask, redemptionsTask)
        if let s { summary = s }
        if let c { catalog = c }
        if let r { redemptions = r }
    }
}
