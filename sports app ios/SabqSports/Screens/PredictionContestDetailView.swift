import SwiftUI

// تفاصيل مسابقة التوقّع — قبل الإغلاق: عدّاد نتيجة وشريط قاعدة مولّد من
// ملف الاحتساب الفعّال؛ بعد التسوية: بطاقة مزدوجة تفصل نقاط الترتيب عن
// مكافأة المحفظة، وSheet «كيف حُسبت نقاطي؟» بنفس أرقام سجل الخادم.

struct PredictionContestDetailView: View {
    let contestId: String

    @Environment(SpAuthStore.self) private var auth
    @State private var detail: PredContestDetailResponse?
    @State private var settlement: PredSettlementResponse?
    @State private var predHome = 0
    @State private var predAway = 0
    @State private var submitting = false
    @State private var justSaved = false
    @State private var submitError: String?
    @State private var showBreakdown = false
    @State private var loading = true

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if loading {
                    SpLoading()
                } else if let detail {
                    header(detail)
                    content(detail)
                } else {
                    SpEmptyState(icon: "wifi.exclamationmark",
                                 title: L("تعذّر تحميل المسابقة"),
                                 subtitle: L("تحقق من اتصالك ثم حاول مجددًا"))
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 28)
        }
        .background(SpTheme.screenGradient.ignoresSafeArea())
        .navigationTitle(navTitle)
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .sheet(isPresented: $showBreakdown) {
            PredBreakdownSheet(settlement: settlement)
                .presentationDetents([.medium, .large])
        }
    }

    private var navTitle: String {
        guard let meta = detail?.metadata,
              let home = meta.home?.name, let away = meta.away?.name else { return L("التوقّع") }
        return "\(home) × \(away)"
    }

    // MARK: - الرأس

    private func header(_ detail: PredContestDetailResponse) -> some View {
        VStack(spacing: 10) {
            HStack(spacing: 12) {
                teamColumn(detail.metadata?.home)
                centerScore(detail)
                teamColumn(detail.metadata?.away)
            }
            if let round = detail.metadata?.round, !round.isEmpty {
                Text([round, detail.metadata?.venue].compactMap { $0 }.joined(separator: " · "))
                    .font(SportsFonts.app(size: 11))
                    .foregroundStyle(SpTheme.onDarkFaint)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous)
                .fill(SpTheme.cardFill)
                .overlay(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).stroke(SpTheme.cardStroke, lineWidth: 1))
        )
    }

    private func teamColumn(_ team: PredTeamMeta?) -> some View {
        VStack(spacing: 6) {
            AsyncImage(url: team?.logo.flatMap(URL.init(string:))) { image in
                image.resizable().scaledToFit()
            } placeholder: {
                Image(systemName: "shield.fill").foregroundStyle(SpTheme.onDarkFaint.opacity(0.4))
            }
            .frame(width: 44, height: 44)
            Text(team?.name ?? L("يُحدد لاحقًا"))
                .font(SportsFonts.app(size: 12.5, weight: .bold))
                .foregroundStyle(SpTheme.onDark)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder
    private func centerScore(_ detail: PredContestDetailResponse) -> some View {
        if detail.status == "settled", let result = detail.result,
           let home = result.finalHome, let away = result.finalAway {
            Text(PredFormat.scorePair(home: home, away: away))
                .font(SportsFonts.app(size: 26, weight: .heavy))
                .foregroundStyle(SpTheme.onDark)
                .monospacedDigit()
        } else if let date = detail.locksAtDate {
            VStack(spacing: 2) {
                Text(date, format: .dateTime.hour().minute())
                    .font(SportsFonts.app(size: 18, weight: .heavy))
                    .foregroundStyle(SpTheme.onDark)
                    .monospacedDigit()
                Text(date, format: .dateTime.day().month(.wide))
                    .font(SportsFonts.app(size: 10.5))
                    .foregroundStyle(SpTheme.onDarkFaint)
            }
        }
    }

    // MARK: - المحتوى حسب الحالة

    @ViewBuilder
    private func content(_ detail: PredContestDetailResponse) -> some View {
        switch detail.status {
        case "open":
            openSection(detail)
        case "locked", "ready":
            lockedSection(detail)
        case "settled":
            settledSection(detail)
        case "void":
            SpEmptyState(icon: "xmark.circle",
                         title: L("أُلغيت هذه المباراة"),
                         subtitle: L("لا نقاط ولا خسارة — توقّعك لم يدخل الاحتساب"))
        default:
            EmptyView()
        }
    }

    // مفتوحة: قاعدة + عدّاد + إرسال
    @ViewBuilder
    private func openSection(_ detail: PredContestDetailResponse) -> some View {
        if let rule = detail.rule {
            Text(rule.summaryAr)
                .font(SportsFonts.app(size: 11.5, weight: .semibold))
                .foregroundStyle(SpTheme.green)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(12)
                .background(RoundedRectangle(cornerRadius: SpTheme.chipRadius, style: .continuous).fill(SpTheme.green.opacity(0.10)))
        }

        // ثلاث حالات ثابتة للزر: «توقّعك محفوظ ✓» (الأرقام تطابق المحفوظ —
        // معطّل بلون النجاح فلا يوحي أن الحفظ ضاع)، «حفظ التعديل» (حرّكت
        // الأرقام)، «تأكيد التوقّع» (لا توقّع لك بعد). الوميض المؤقت وحده
        // كان يوهم أن الحفظ لم يتم (بلاغ 2026-08-15).
        let savedPayload = detail.myEntry?.payload
        let isSavedCurrent = savedPayload != nil
            && savedPayload?.predHome == predHome
            && savedPayload?.predAway == predAway

        VStack(spacing: 14) {
            HStack(alignment: .center, spacing: 12) {
                stepper($predHome, teamName: detail.metadata?.home?.name)
                Text("-")
                    .font(SportsFonts.app(size: 22, weight: .heavy))
                    .foregroundStyle(SpTheme.onDarkFaint)
                stepper($predAway, teamName: detail.metadata?.away?.name)
            }

            Button {
                // بوابة الدخول قبل الإرسال — 401 كان يظهر كأن «المباراة أُقفلت».
                guard auth.isLoggedIn else { SpAppRouter.shared.requestLogin(); return }
                guard !isSavedCurrent else { return }
                Task { await submit() }
            } label: {
                HStack(spacing: 8) {
                    if submitting { ProgressView().tint(.white) }
                    if isSavedCurrent && !justSaved {
                        Image(systemName: "checkmark.seal.fill").font(.system(size: 14, weight: .bold))
                    }
                    Text(buttonTitle(isSavedCurrent: isSavedCurrent, hasEntry: savedPayload != nil))
                        .font(SportsFonts.app(size: 14, weight: .bold))
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .frame(height: 46)
                .background(
                    RoundedRectangle(cornerRadius: SpTheme.buttonRadius, style: .continuous)
                        .fill(justSaved || isSavedCurrent ? SpTheme.leaf : SpTheme.green)
                )
            }
            .buttonStyle(.plain)
            .disabled(submitting || (isSavedCurrent && !justSaved))

            if isSavedCurrent {
                Text(L("حرّك الأرقام لتعديل توقّعك"))
                    .font(SportsFonts.app(size: 11, weight: .semibold))
                    .foregroundStyle(SpTheme.onDarkDim)
            }

            if !auth.isLoggedIn {
                Text(L("سجّل دخولك ليُحفظ توقّعك باسمك وتنافس على الجائزة"))
                    .font(SportsFonts.app(size: 11, weight: .semibold))
                    .foregroundStyle(SpTheme.onDarkDim)
            }

            if let submitError {
                Text(submitError)
                    .font(SportsFonts.app(size: 11.5, weight: .semibold))
                    .foregroundStyle(SpTheme.crimson)
            }

            if let date = detail.locksAtDate {
                Text(PredDates.countdown(to: date).map { "\($0) · " + L("يمكنك التعديل حتى ضربة البداية") }
                     ?? L("يُقفل التوقّع عند ضربة البداية"))
                    .font(SportsFonts.app(size: 10.5))
                    .foregroundStyle(SpTheme.onDarkFaint)
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous)
                .fill(SpTheme.cardFill)
                .overlay(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).stroke(SpTheme.cardStroke, lineWidth: 1))
        )
    }

    private func buttonTitle(isSavedCurrent: Bool, hasEntry: Bool) -> String {
        if justSaved { return L("تم حفظ توقّعك ✓") }
        if isSavedCurrent { return L("توقّعك محفوظ") + " " + PredFormat.scorePair(home: predHome, away: predAway) }
        if hasEntry { return L("حفظ التعديل") + " " + PredFormat.scorePair(home: predHome, away: predAway) }
        return L("تأكيد التوقّع") + " " + PredFormat.scorePair(home: predHome, away: predAway)
    }

    private func stepper(_ value: Binding<Int>, teamName: String?) -> some View {
        VStack(spacing: 8) {
            Text(teamName ?? "")
                .font(SportsFonts.app(size: 11, weight: .bold))
                .foregroundStyle(SpTheme.onDarkDim)
                .lineLimit(1)
            Text("\(value.wrappedValue)")
                .font(SportsFonts.app(size: 28, weight: .heavy))
                .foregroundStyle(SpTheme.onDark)
                .frame(width: 62, height: 62)
                .background(RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous).fill(SpTheme.chipFill))
                .monospacedDigit()
            HStack(spacing: 12) {
                stepButton("minus") { if value.wrappedValue > 0 { value.wrappedValue -= 1 } }
                stepButton("plus") { if value.wrappedValue < 20 { value.wrappedValue += 1 } }
            }
        }
        .frame(maxWidth: .infinity)
    }

    private func stepButton(_ icon: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(SpTheme.green)
                .frame(width: 34, height: 34)
                .background(Circle().fill(SpTheme.green.opacity(0.12)))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(icon == "plus" ? L("زيادة الأهداف") : L("إنقاص الأهداف"))
    }

    // مقفلة: التوقّع مجمّد
    @ViewBuilder
    private func lockedSection(_ detail: PredContestDetailResponse) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "lock.fill")
                .font(.system(size: 13))
                .foregroundStyle(SpTheme.onDarkDim)
            if let payload = detail.myEntry?.payload, let h = payload.predHome, let a = payload.predAway {
                Text(L("توقّعك") + " " + PredFormat.scorePair(home: h, away: a) + " " + L("مقفل — بانتظار صافرة النهاية"))
                    .font(SportsFonts.app(size: 12.5, weight: .bold))
                    .foregroundStyle(SpTheme.onDark)
            } else {
                Text(L("أُقفلت التوقّعات — لم تشارك في هذه المباراة"))
                    .font(SportsFonts.app(size: 12.5, weight: .bold))
                    .foregroundStyle(SpTheme.onDarkDim)
            }
            Spacer()
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous)
                .fill(SpTheme.cardFill)
                .overlay(RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous).stroke(SpTheme.cardStroke, lineWidth: 1))
        )
    }

    // مسوّاة: الفئة + البطاقة المزدوجة + زر الشرح
    @ViewBuilder
    private func settledSection(_ detail: PredContestDetailResponse) -> some View {
        let award = settlement?.myAwards.first

        if let payload = detail.myEntry?.payload, let h = payload.predHome, let a = payload.predAway {
            HStack {
                Text(L("توقّعتَ") + " " + PredFormat.scorePair(home: h, away: a))
                    .font(SportsFonts.app(size: 12.5, weight: .bold))
                    .foregroundStyle(SpTheme.onDarkDim)
                Spacer()
                if let award {
                    Text("🎯 " + award.reasonLabelAr)
                        .font(SportsFonts.app(size: 11.5, weight: .heavy))
                        .foregroundStyle(SpTheme.goldDeep)
                        .padding(.horizontal, 11).padding(.vertical, 5)
                        .background(Capsule().fill(SpTheme.gold.opacity(0.15)))
                } else if detail.myEntry != nil {
                    Text(L("لم تُصب هذه المرة"))
                        .font(SportsFonts.app(size: 11.5, weight: .bold))
                        .foregroundStyle(SpTheme.onDarkFaint)
                }
            }
        }

        if let award {
            HStack(spacing: 8) {
                pointsHalf(value: "+\(award.points)",
                           label: L("نقاط البطولة → الترتيب"),
                           tint: SpTheme.green)
                if let wallet = award.wallet {
                    pointsHalf(value: "+\(wallet.walletPoints)",
                               label: Lf("محفظتك (×%.1f عضوية)", wallet.multiplier),
                               tint: SpTheme.goldDeep)
                }
            }

            Button { showBreakdown = true } label: {
                HStack {
                    Image(systemName: "questionmark.circle.fill")
                    Text(L("كيف حُسبت نقاطي؟"))
                        .font(SportsFonts.app(size: 13, weight: .bold))
                    Spacer()
                    Image(systemName: "chevron.backward")
                        .font(.system(size: 11, weight: .bold))
                }
                .foregroundStyle(SpTheme.green)
                .padding(14)
                .background(
                    RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous)
                        .fill(SpTheme.green.opacity(0.10))
                )
            }
            .buttonStyle(.plain)
        } else if detail.myEntry == nil {
            SpEmptyState(icon: "clock.arrow.circlepath",
                         title: L("لم تشارك في هذه المباراة"),
                         subtitle: L("توقّع المباريات القادمة لتجمع النقاط"))
        }
    }

    private func pointsHalf(value: String, label: String, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(value)
                .font(SportsFonts.app(size: 19, weight: .heavy))
                .foregroundStyle(tint)
                .monospacedDigit()
            Text(label)
                .font(SportsFonts.app(size: 10.5, weight: .bold))
                .foregroundStyle(tint.opacity(0.85))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous).fill(tint.opacity(0.11)))
    }

    // MARK: - التحميل والإرسال

    private func load() async {
        // لا وميض عند إعادة التحميل بعد الحفظ — البطاقة القائمة تبقى معروضة.
        loading = detail == nil
        do {
            let response = try await APIClient.shared.fetchPredContest(id: contestId)
            detail = response
            if let payload = response.myEntry?.payload {
                predHome = payload.predHome ?? 0
                predAway = payload.predAway ?? 0
            }
            if response.status == "settled" {
                settlement = try? await APIClient.shared.fetchPredSettlement(contestId: contestId)
            }
        } catch {
            detail = nil
        }
        loading = false
    }

    private func submit() async {
        submitting = true
        submitError = nil
        do {
            _ = try await APIClient.shared.submitPredEntry(contestId: contestId, predHome: predHome, predAway: predAway)
            // إعادة التحميل تُثبت «توقّعك» من الخادم — النجاح كان يختفي بعد
            // 1.8 ثانية فيبدو كأن الحفظ فشل (جوهر بلاغ «لا يتم الحفظ»).
            await load()
            justSaved = true
            try? await Task.sleep(nanoseconds: 1_800_000_000)
            justSaved = false
        } catch APIError.unauthorized {
            submitError = L("سجّل دخولك للمشاركة في التوقّعات")
            SpAppRouter.shared.requestLogin()
        } catch let APIError.server(status, _) {
            submitError = switch status {
            case 422: L("نتيجة غير صالحة — تحقق من الأرقام")
            case 503: L("التوقّعات متوقفة مؤقتًا — عُد قريبًا")
            default: L("تعذّر الحفظ — أُقفلت المباراة أو أن مسابقتها غير متاحة حاليًا")
            }
            await load() // اعرض الحالة الفعلية من الخادم بدل التخمين
        } catch {
            submitError = L("تعذّر حفظ التوقّع — تحقق من اتصالك وحاول مجددًا")
        }
        submitting = false
    }
}

// MARK: - Sheet «كيف حُسبت نقاطي؟»

private struct PredBreakdownSheet: View {
    let settlement: PredSettlementResponse?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(L("كيف حُسبت نقاطي؟"))
                .font(SportsFonts.app(size: 16, weight: .heavy))
                .foregroundStyle(SpTheme.onDark)

            if let award = settlement?.myAwards.first {
                VStack(alignment: .leading, spacing: 0) {
                    if let pool = award.breakdown?.pool {
                        if let base = pool.base {
                            step(1, Lf("جائزة المباراة %d نقطة", base + (pool.carriedIn ?? 0))
                                 + ((pool.carriedIn ?? 0) > 0 ? Lf(" (%d أساس + %d مُرحّلة)", base, pool.carriedIn ?? 0) : ""))
                        }
                        if let share = pool.tierShare, let tierPoints = pool.tierPoints {
                            step(2, Lf("حصة فئة «%@» %d٪ = %d نقطة", award.reasonLabelAr, Int((share * 100).rounded()), tierPoints * (pool.winners ?? 1)))
                        }
                        if let winners = pool.winners {
                            step(3, Lf("تقاسمها %d فائزًا → %d نقطة في ترتيب البطولة", winners, award.points))
                        }
                    } else {
                        step(1, Lf("حصلت على %d نقطة — %@", award.points, award.reasonLabelAr))
                    }
                    if let wallet = award.wallet {
                        step(4, Lf("مضاعف عضويتك ×%.1f → %d نقطة أُودعت في محفظتك", wallet.multiplier, wallet.walletPoints))
                    }
                }

                Text(L("رقم مرجعي للدعم: ") + award.referenceId.prefix(8).uppercased())
                    .font(SportsFonts.app(size: 10.5))
                    .foregroundStyle(SpTheme.onDarkFaint)
                    .frame(maxWidth: .infinity, alignment: .center)
            } else {
                SpEmptyState(icon: "doc.text.magnifyingglass",
                             title: L("لا نقاط في هذه المباراة"),
                             subtitle: L("لم يدخل توقّعك ضمن الفئات الفائزة"))
            }

            Spacer(minLength: 0)
        }
        .padding(20)
        .background(SpTheme.surface.ignoresSafeArea())
    }

    private func step(_ index: Int, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Text("\(index)")
                .font(SportsFonts.app(size: 11, weight: .heavy))
                .foregroundStyle(SpTheme.green)
                .frame(width: 22, height: 22)
                .background(Circle().fill(SpTheme.green.opacity(0.13)))
            Text(text)
                .font(SportsFonts.app(size: 12.5, weight: .semibold))
                .foregroundStyle(SpTheme.onDark)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.vertical, 7)
    }
}
