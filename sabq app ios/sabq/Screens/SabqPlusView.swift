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
            VStack(alignment: .leading, spacing: 24) {
                previewNote
                memberCard
                earnSection
                catalogSection
                historySection
                termsSection
                Text("نموذج محاكاة داخلي لتجربة «سبق بلس × ولاء ون» — أسماء الشركاء تجريبية والخصم من رصيدك فعلي")
                    .font(SabqFonts.app(size: 12, weight: .medium))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .frame(maxWidth: .infinity)
                    .multilineTextAlignment(.center)
                    .padding(.top, 12)
            }
            .padding(16)
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
            .font(SabqFonts.app(size: 12, weight: .bold))
            .foregroundStyle(Color(red: 0.42, green: 0.31, blue: 0))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            .padding(.horizontal, 12)
            .background(Color(red: 1, green: 0.93, blue: 0.72), in: RoundedRectangle(cornerRadius: 10))
    }

    // MARK: - بطاقة العضوية (v2 — كحلي سبق المعتمد)

    private let cardNavyTop = Color(red: 0.063, green: 0.137, blue: 0.227)
    private let cardNavyMid = Color(red: 0.043, green: 0.086, blue: 0.141)
    private let cardNavyEnd = Color(red: 0.090, green: 0.161, blue: 0.290)
    private let sabqBlue = Color(red: 0.090, green: 0.576, blue: 0.910)
    private let ambPurple = Color(red: 0.486, green: 0.227, blue: 0.929)

    private var memberCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            let name = authStore.currentUser?.displayName ?? "مسؤول النظام"
            Text(name)
                .font(SabqFonts.app(size: 20, weight: .heavy))
                .foregroundStyle(.white)
            Text("مسؤول النظام · حساب التجربة")
                .font(SabqFonts.app(size: 12, weight: .medium))
                .foregroundStyle(Color(red: 0.616, green: 0.714, blue: 0.800))
                .padding(.bottom, 18)

            if let summary = loader.summary {
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Text(String(format: "%.2f", summary.sarValue))
                        .font(SabqFonts.app(size: 44, weight: .heavy))
                        .foregroundStyle(.white)
                        .monospacedDigit()
                    Text("ر.س")
                        .font(SabqFonts.app(size: 18, weight: .bold))
                        .foregroundStyle(Color(red: 0.561, green: 0.722, blue: 0.847))
                    Text("\(formatPoints(summary.totalPoints)) نقطة")
                        .font(SabqFonts.app(size: 13, weight: .semibold))
                        .foregroundStyle(Color(red: 0.659, green: 0.761, blue: 0.847))
                        .monospacedDigit()
                }
                Text("كل \(summary.pointsPerSar) نقطة = 1 ريال سعودي · الاستبدال عبر شركاء ولاء ون")
                    .font(SabqFonts.app(size: 11, weight: .medium))
                    .foregroundStyle(Color(red: 0.498, green: 0.631, blue: 0.737))
                    .padding(.top, 4)

                tierJourney(summary)
                    .padding(.top, 16)

                statsPanel(summary)
                    .padding(.top, 14)

                Group {
                    if let next = summary.nextTier {
                        Text("يفصلك \(formatPoints(summary.pointsToNext)) نقطة عن فئة «\(next.nameAr)»")
                    } else {
                        Text("وصلت لأعلى فئة — يُحتسب مضاعف السفير على كل مكافآت التوقعات")
                    }
                }
                .font(SabqFonts.app(size: 11.5, weight: .semibold))
                .foregroundStyle(Color(red: 0.788, green: 0.722, blue: 0.961))
                .padding(.vertical, 8)
                .padding(.horizontal, 12)
                .background(ambPurple.opacity(0.16), in: RoundedRectangle(cornerRadius: 10))
                .padding(.top, 14)
            } else if loader.isLoading {
                ProgressView()
                    .tint(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 40)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(22)
        .background(
            ZStack {
                LinearGradient(
                    colors: [cardNavyTop, cardNavyMid, cardNavyEnd],
                    startPoint: .topLeading, endPoint: .bottomTrailing
                )
                RadialGradient(
                    colors: [sabqBlue.opacity(0.32), .clear],
                    center: .init(x: 0.1, y: 1.15), startRadius: 10, endRadius: 280
                )
                RadialGradient(
                    colors: [ambPurple.opacity(0.30), .clear],
                    center: .init(x: 0.92, y: -0.1), startRadius: 10, endRadius: 240
                )
                Text("+")
                    .font(.system(size: 200, weight: .black))
                    .foregroundStyle(sabqBlue.opacity(0.09))
                    .offset(x: -110, y: 70)
            }
        )
        .clipShape(RoundedRectangle(cornerRadius: 22))
        .overlay(
            RoundedRectangle(cornerRadius: 22)
                .stroke(Color(red: 0.549, green: 0.706, blue: 0.863).opacity(0.14), lineWidth: 1)
        )
    }

    private func tierJourney(_ summary: PlusSummary) -> some View {
        HStack(spacing: 7) {
            Text(summary.tier.nameAr)
                .font(SabqFonts.app(size: 12.5, weight: .heavy))
                .foregroundStyle(Color(red: 0.851, green: 0.780, blue: 1))
                .padding(.vertical, 5)
                .padding(.horizontal, 12)
                .background(ambPurple.opacity(0.22), in: Capsule())
                .overlay(Capsule().stroke(Color(red: 0.655, green: 0.478, blue: 0.980).opacity(0.55), lineWidth: 1))
            ForEach(LoyaltyTiers.all) { tier in
                Circle()
                    .fill(tier.level <= summary.tier.level ? tier.color : Color.white.opacity(0.14))
                    .frame(
                        width: tier.level == summary.tier.level ? 12 : 9,
                        height: tier.level == summary.tier.level ? 12 : 9
                    )
                    .shadow(color: tier.level == summary.tier.level ? tier.color : .clear, radius: 5)
            }
            Text(summary.tier.level >= 5 ? "5/5" : "\(summary.tier.level)/5")
                .font(SabqFonts.app(size: 10.5, weight: .semibold))
                .foregroundStyle(Color(red: 0.616, green: 0.714, blue: 0.800))
                .monospacedDigit()
        }
    }

    private func statsPanel(_ summary: PlusSummary) -> some View {
        VStack(spacing: 0) {
            statRow("نقاط مدى الحياة", formatPoints(summary.lifetimePoints), divider: false)
            statRow("نقاط هذا الشهر", "+\(formatPoints(summary.monthPoints))")
            statRow("مضاعف التوقعات", "×\(summary.predictionMultiplier.clean)")
        }
        .padding(.vertical, 6)
        .padding(.horizontal, 14)
        .background(Color.white.opacity(0.045), in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.white.opacity(0.09), lineWidth: 1))
    }

    private func statRow(_ label: String, _ value: String, divider: Bool = true) -> some View {
        VStack(spacing: 0) {
            if divider { Divider().overlay(Color.white.opacity(0.08)) }
            HStack {
                Text(label)
                    .font(SabqFonts.app(size: 12, weight: .medium))
                    .foregroundStyle(Color(red: 0.616, green: 0.714, blue: 0.800))
                Spacer()
                Text(value)
                    .font(SabqFonts.app(size: 14, weight: .bold))
                    .foregroundStyle(.white)
                    .monospacedDigit()
            }
            .padding(.vertical, 8)
        }
    }

    // MARK: - كيف تكسب

    private var earnSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionTitle("كيف تكسب النقاط")
            Text("تُمنح النقاط تلقائياً أثناء استخدامك سبق — لا حاجة لأي خطوة إضافية.")
                .font(SabqFonts.app(size: 13, weight: .medium))
                .foregroundStyle(SabqTheme.secondaryInk)
            let earns: [(String, String, String)] = [
                ("book", "قراءة مقال", "+2"),
                ("book.closed", "قراءة عميقة", "+3"),
                ("bubble.right", "تعليق", "+1"),
                ("arrow.turn.down.left", "دخول يومي", "+5 × السلسلة"),
                ("trophy", "فوز توقّع رياضي", "حسب البركة"),
            ]
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                ForEach(earns, id: \.1) { icon, label, value in
                    HStack(spacing: 8) {
                        Image(systemName: icon)
                            .font(.system(size: 15))
                            .foregroundStyle(sabqBlue)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(label)
                                .font(SabqFonts.app(size: 12, weight: .semibold))
                                .foregroundStyle(SabqTheme.ink)
                            Text(value)
                                .font(SabqFonts.app(size: 12, weight: .heavy))
                                .foregroundStyle(sabqBlue)
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(10)
                    .background(SabqTheme.surface, in: RoundedRectangle(cornerRadius: 12))
                }
            }
            Text("القيم الحالية للإنتاج — جدول الاكتساب الجديد (المكافئ للريال) قيد الاعتماد.")
                .font(SabqFonts.app(size: 11, weight: .medium))
                .foregroundStyle(SabqTheme.secondaryInk)
        }
    }

    // MARK: - الكتالوج

    private let walaPurple = Color(red: 0.482, green: 0.424, blue: 0.878)
    private let walaDeep = Color(red: 0.373, green: 0.310, blue: 0.820)
    private let walaYellow = Color(red: 1, green: 0.788, blue: 0.200)

    private var catalogSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                sectionTitle("استبدل نقاطك")
                Text("W بالتعاون مع ولاء ون")
                    .font(SabqFonts.app(size: 11, weight: .heavy))
                    .foregroundStyle(walaPurple)
                    .padding(.vertical, 4)
                    .padding(.horizontal, 10)
                    .background(walaPurple.opacity(0.12), in: Capsule())
            }
            Text("بعد تأكيد الاستبدال تصدر قسيمتك فوراً برمز QR ويمكن إضافتها إلى Apple Wallet. أسماء الشركاء تجريبية للمحاكاة.")
                .font(SabqFonts.app(size: 13, weight: .medium))
                .foregroundStyle(SabqTheme.secondaryInk)

            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                ForEach(loader.catalog?.rewards ?? []) { reward in
                    rewardCard(reward)
                }
            }
        }
    }

    private func rewardCard(_ reward: PlusReward) -> some View {
        let balance = loader.catalog?.balance ?? 0
        let affordable = balance >= reward.pointsCost
        let brand = Color(plusHex: reward.brandColor)
        return VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 10) {
                partnerBadge(category: reward.category, brand: brand, size: 46, iconSize: 20)
                VStack(alignment: .leading, spacing: 2) {
                    Text(reward.partnerName)
                        .font(SabqFonts.app(size: 14, weight: .heavy))
                        .foregroundStyle(SabqTheme.ink)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                    Text(reward.category + " · ولاء ون")
                        .font(SabqFonts.app(size: 10.5, weight: .medium))
                        .foregroundStyle(SabqTheme.secondaryInk)
                }
                Spacer(minLength: 0)
            }

            Text(reward.valueLabel)
                .font(SabqFonts.app(size: 12, weight: .heavy))
                .foregroundStyle(brand)
                .padding(.vertical, 4)
                .padding(.horizontal, 10)
                .background(brand.opacity(0.12), in: Capsule())

            Text(reward.offer)
                .font(SabqFonts.app(size: 12, weight: .medium))
                .foregroundStyle(SabqTheme.secondaryInk)
                .lineLimit(2)
                .frame(minHeight: 32, alignment: .top)

            Divider().opacity(0.5)

            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: 0) {
                    Text("\(formatPoints(reward.pointsCost)) نقطة")
                        .font(SabqFonts.app(size: 12.5, weight: .heavy))
                        .foregroundStyle(SabqTheme.ink)
                        .monospacedDigit()
                    Text("≈ \(String(format: "%.2f", reward.sarValue)) ر.س")
                        .font(SabqFonts.app(size: 10, weight: .semibold))
                        .foregroundStyle(SabqTheme.secondaryInk)
                        .monospacedDigit()
                }
                Spacer()
                Button {
                    agreedToTerms = false
                    confirmReward = reward
                } label: {
                    Text(affordable ? "استبدل" : "لا يكفي")
                        .font(SabqFonts.app(size: 12.5, weight: .heavy))
                        .foregroundStyle(.white)
                        .padding(.vertical, 8)
                        .padding(.horizontal, 16)
                        .background(
                            affordable
                                ? AnyShapeStyle(LinearGradient(colors: [walaPurple, walaDeep], startPoint: .top, endPoint: .bottom))
                                : AnyShapeStyle(SabqTheme.outline),
                            in: RoundedRectangle(cornerRadius: 11)
                        )
                }
                .disabled(!affordable || isRedeeming)
            }
        }
        .padding(14)
        .background(SabqTheme.surface, in: RoundedRectangle(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(brand.opacity(0.18), lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.05), radius: 8, y: 3)
    }

    /// «شعار» الشريك: أيقونة الفئة داخل مربع متدرج بلون العلامة —
    /// الشركاء تجريبيون فلا شعارات حقيقية، والأيقونة التعبيرية أرقى
    /// بصرياً من حرف مفرد. عند تكامل ولاء ون تُستبدل بصور الكتالوج.
    private func partnerBadge(category: String, brand: Color, size: CGFloat, iconSize: CGFloat) -> some View {
        Image(systemName: categoryIcon(for: category))
            .font(.system(size: iconSize, weight: .semibold))
            .foregroundStyle(.white)
            .frame(width: size, height: size)
            .background(
                LinearGradient(
                    colors: [brand.opacity(0.85), brand],
                    startPoint: .topLeading, endPoint: .bottomTrailing
                ),
                in: RoundedRectangle(cornerRadius: size * 0.28)
            )
            .overlay(
                RoundedRectangle(cornerRadius: size * 0.28)
                    .stroke(Color.white.opacity(0.25), lineWidth: 0.8)
            )
            .shadow(color: brand.opacity(0.35), radius: 5, y: 2)
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
        VStack(alignment: .leading, spacing: 14) {
            Text("تأكيد الاستبدال")
                .font(SabqFonts.app(size: 18, weight: .heavy))
                .foregroundStyle(SabqTheme.ink)
            Text("\(reward.partnerName) — \(reward.offer)")
                .font(SabqFonts.app(size: 13, weight: .medium))
                .foregroundStyle(SabqTheme.secondaryInk)

            VStack(spacing: 0) {
                confirmRow("قيمة القسيمة", reward.valueLabel)
                confirmRow("التكلفة", "\(formatPoints(reward.pointsCost)) نقطة")
                let after = (loader.catalog?.balance ?? 0) - reward.pointsCost
                confirmRow("رصيدك بعد الاستبدال", "\(formatPoints(after)) نقطة (≈ \(String(format: "%.2f", Double(after) / 500)) ر.س)")
            }

            Text("⚠ بعد التأكيد تسري شروط وأحكام ولاء ون ولا يمكن التراجع أو استرداد النقاط.")
                .font(SabqFonts.app(size: 12, weight: .semibold))
                .foregroundStyle(SabqTheme.ink)
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(walaPurple.opacity(0.10), in: RoundedRectangle(cornerRadius: 10))

            Toggle(isOn: $agreedToTerms) {
                Text("أوافق على شروط استخدام سبق بلس وشروط وأحكام ولاء ون")
                    .font(SabqFonts.app(size: 12.5, weight: .medium))
                    .foregroundStyle(SabqTheme.ink)
            }
            .tint(walaPurple)

            Button {
                Task { await redeem(reward) }
            } label: {
                HStack {
                    if isRedeeming { ProgressView().tint(.white) }
                    Text(isRedeeming ? "جارٍ الاستبدال…" : "تأكيد الاستبدال")
                        .font(SabqFonts.app(size: 15, weight: .heavy))
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 13)
                .background(agreedToTerms ? walaPurple : SabqTheme.outline, in: RoundedRectangle(cornerRadius: 12))
            }
            .disabled(!agreedToTerms || isRedeeming)

            Button("إلغاء") { confirmReward = nil }
                .font(SabqFonts.app(size: 14, weight: .semibold))
                .foregroundStyle(SabqTheme.secondaryInk)
                .frame(maxWidth: .infinity)

            Spacer(minLength: 0)
        }
        .padding(20)
        .background(SabqTheme.background.ignoresSafeArea())
    }

    private func confirmRow(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label)
                .font(SabqFonts.app(size: 12.5, weight: .medium))
                .foregroundStyle(SabqTheme.secondaryInk)
            Spacer()
            Text(value)
                .font(SabqFonts.app(size: 12.5, weight: .bold))
                .foregroundStyle(SabqTheme.ink)
                .monospacedDigit()
        }
        .padding(.vertical, 8)
        .overlay(alignment: .bottom) {
            Divider().opacity(0.5)
        }
    }

    // MARK: - التهنئة + بطاقة القسيمة

    private func celebrationScreen(_ voucher: PlusVoucher) -> some View {
        ScrollView {
            VStack(spacing: 16) {
                Text("🎉")
                    .font(.system(size: 52))
                    .padding(.top, 30)
                Text("مبروك! تم الاستبدال")
                    .font(SabqFonts.app(size: 22, weight: .heavy))
                    .foregroundStyle(SabqTheme.ink)
                Text("قسيمتك من \(voucher.partnerName) جاهزة — أبرِزها عند الشريك أو أضفها لمحفظتك")
                    .font(SabqFonts.app(size: 13, weight: .medium))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .multilineTextAlignment(.center)

                voucherPassCard(voucher)

                Button {
                    Task { await addToWallet(redemptionId: voucher.redemptionId) }
                } label: {
                    HStack(spacing: 8) {
                        if walletBusyId == voucher.redemptionId {
                            ProgressView().tint(.white)
                        } else {
                            Image(systemName: "wallet.pass.fill")
                        }
                        Text("أضفها إلى Apple Wallet")
                            .font(SabqFonts.app(size: 14.5, weight: .bold))
                    }
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 13)
                    .background(Color.black, in: RoundedRectangle(cornerRadius: 12))
                }
                .disabled(walletBusyId != nil)

                Text("خُصمت \(formatPoints(voucher.pointsSpent)) نقطة · رصيدك الجديد \(formatPoints(loader.catalog?.balance ?? 0)) نقطة")
                    .font(SabqFonts.app(size: 11.5, weight: .medium))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .monospacedDigit()

                Button("تم") { celebrationVoucher = nil }
                    .font(SabqFonts.app(size: 15, weight: .bold))
                    .foregroundStyle(SabqTheme.ink)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(SabqTheme.surface, in: RoundedRectangle(cornerRadius: 12))
                    .padding(.bottom, 24)
            }
            .padding(20)
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
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                partnerBadge(
                    category: voucher.category ?? "",
                    brand: Color(plusHex: voucher.brandColor),
                    size: 40, iconSize: 17
                )
                Text(voucher.partnerName)
                    .font(SabqFonts.app(size: 17, weight: .heavy))
                    .foregroundStyle(.white)
            }
            Text("\(voucher.offer) · \(voucher.valueLabel)")
                .font(SabqFonts.app(size: 12, weight: .medium))
                .foregroundStyle(Color(red: 0.894, green: 0.871, blue: 1))

            VStack(spacing: 6) {
                if let qr = generateQR(from: voucher.code) {
                    Image(uiImage: qr)
                        .interpolation(.none)
                        .resizable()
                        .frame(width: 140, height: 140)
                }
                Text(voucher.code)
                    .font(.system(size: 13, weight: .heavy, design: .monospaced))
                    .kerning(2)
                    .foregroundStyle(Color(red: 0.102, green: 0.071, blue: 0.200))
                    .environment(\.layoutDirection, .leftToRight)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(Color.white, in: RoundedRectangle(cornerRadius: 12))

            HStack {
                Text("صالحة حتى \(formatDate(voucher.expiresAt))")
                Spacer()
                Text("سبق بلس × ولاء ون")
            }
            .font(SabqFonts.app(size: 10.5, weight: .medium))
            .foregroundStyle(Color(red: 0.851, green: 0.824, blue: 0.980))
        }
        .padding(18)
        .background(
            ZStack(alignment: .topLeading) {
                LinearGradient(colors: [walaDeep, walaPurple], startPoint: .topTrailing, endPoint: .bottomLeading)
                Text("W")
                    .font(.system(size: 110, weight: .black).italic())
                    .foregroundStyle(walaYellow.opacity(0.18))
                    .offset(x: -8, y: -26)
            }
        )
        .clipShape(RoundedRectangle(cornerRadius: 18))
    }

    // MARK: - السجل

    private var historySection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                sectionTitle("سجل استبدالاتي")
                Spacer()
                if !installedSerials.isEmpty {
                    Button {
                        cleanupWalletPasses()
                    } label: {
                        Label("تنظيف Wallet (\(installedSerials.count))", systemImage: "wallet.pass")
                            .font(SabqFonts.app(size: 11.5, weight: .bold))
                            .foregroundStyle(walaPurple)
                            .padding(.vertical, 5)
                            .padding(.horizontal, 10)
                            .background(walaPurple.opacity(0.10), in: Capsule())
                    }
                }
            }
            if loader.redemptions.isEmpty {
                Text("لا توجد استبدالات بعد — جرّب استبدال أول قسيمة ✨")
                    .font(SabqFonts.app(size: 13, weight: .medium))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 22)
                    .background(SabqTheme.surface, in: RoundedRectangle(cornerRadius: 14))
            } else {
                VStack(spacing: 8) {
                    ForEach(loader.redemptions) { item in
                        redemptionRow(item)
                    }
                }
            }
        }
    }

    private func redemptionRow(_ item: PlusRedemption) -> some View {
        HStack(spacing: 10) {
            partnerBadge(
                category: item.category ?? "",
                brand: Color(plusHex: item.brandColor ?? "#4A4A5A"),
                size: 34, iconSize: 14
            )
            VStack(alignment: .leading, spacing: 2) {
                Text(item.partnerName ?? "قسيمة")
                    .font(SabqFonts.app(size: 13.5, weight: .bold))
                    .foregroundStyle(SabqTheme.ink)
                HStack(spacing: 6) {
                    if let code = item.code {
                        Text(code)
                            .font(.system(size: 10.5, weight: .semibold, design: .monospaced))
                            .environment(\.layoutDirection, .leftToRight)
                    }
                    if let date = item.redeemedAt {
                        Text(formatDate(date))
                            .font(SabqFonts.app(size: 10.5, weight: .medium))
                    }
                }
                .foregroundStyle(SabqTheme.secondaryInk)
            }
            Spacer()
            Text("−\(formatPoints(item.pointsSpent))")
                .font(SabqFonts.app(size: 13, weight: .heavy))
                .foregroundStyle(Color(red: 0.840, green: 0.271, blue: 0.271))
                .monospacedDigit()
            if item.code != nil {
                let installed = installedSerials.contains(walletSerial(for: item.id))
                Button {
                    Task { await addToWallet(redemptionId: item.id) }
                } label: {
                    if walletBusyId == item.id {
                        ProgressView().frame(width: 26, height: 26)
                    } else {
                        Image(systemName: installed ? "wallet.pass.fill" : "wallet.pass")
                            .font(.system(size: 15))
                            .foregroundStyle(installed ? Color(red: 0.09, green: 0.64, blue: 0.42) : walaPurple)
                            .frame(width: 26, height: 26)
                    }
                }
                .disabled(walletBusyId != nil)
            }
            Button {
                removalTarget = item
            } label: {
                Image(systemName: "trash")
                    .font(.system(size: 14))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .frame(width: 26, height: 26)
            }
            .disabled(isRemoving)
        }
        .padding(12)
        .background(SabqTheme.surface, in: RoundedRectangle(cornerRadius: 14))
    }

    // MARK: - الشروط

    private var termsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionTitle("الإرشادات وشروط الاستخدام")
            Text("ملخص توضيحي — الصياغة القانونية النهائية تُعتمد قبل الإطلاق الرسمي.")
                .font(SabqFonts.app(size: 12.5, weight: .medium))
                .foregroundStyle(SabqTheme.secondaryInk)
            termItem("اكتساب النقاط وأسقفها",
                     "تُمنح النقاط من قراءة المحتوى والتفاعل والدخول اليومي والتوقعات الرياضية وفق الجدول المعلن، وبأسقف يومية مضادة لإساءة الاستخدام.")
            termItem("الاستبدال عبر ولاء ون",
                     "عند تأكيد الاستبدال تُخصم النقاط فوراً وتصدر القسيمة. بعد التأكيد تسري شروط وأحكام ولاء ون ولا يمكن التراجع أو استرداد النقاط.")
            termItem("صلاحية النقاط والقسائم",
                     "نقاط سبق بلس لا تنتهي ما دام حسابك نشطاً. القسائم الصادرة عبر ولاء ون تنتهي بعد 12 شهراً من الإصدار ما لم يُذكر خلاف ذلك.")
            termItem("حدود المسؤولية",
                     "مسؤولية سبق تقتصر على صحة خصم النقاط وإصدار القسيمة. تأخر الشريك أو تغيير عروضه يخضع لشروط ولاء ون والشريك، وفي حال تعذر الإصدار تُعاد النقاط كاملة.")
            termItem("الدعم والنزاعات",
                     "لمشاكل النقاط: دعم سبق خلال 15 يوماً من العملية. لمشاكل استخدام القسيمة لدى الشريك: تُحال لدعم ولاء ون مع رقم المرجع.")
        }
    }

    private func termItem(_ title: String, _ body: String) -> some View {
        DisclosureGroup {
            Text(body)
                .font(SabqFonts.app(size: 12.5, weight: .medium))
                .foregroundStyle(SabqTheme.secondaryInk)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, 6)
        } label: {
            Text(title)
                .font(SabqFonts.app(size: 13.5, weight: .bold))
                .foregroundStyle(SabqTheme.ink)
        }
        .padding(12)
        .background(SabqTheme.surface, in: RoundedRectangle(cornerRadius: 12))
        .tint(SabqTheme.secondaryInk)
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
            .font(SabqFonts.app(size: 18, weight: .heavy))
            .foregroundStyle(SabqTheme.ink)
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
