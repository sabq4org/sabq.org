import SwiftUI

/// مراجعة طلب تعديل من المراسل: كل حقل بقبله وبعده، واختيار ما يُطبَّق،
/// وسطر «تحديث:» اختياري، وإعادة توليد الموجز والسيو، أو الرفض مع سبب.
/// نفس خدمة الويب و«مكتب سبق» (/editorial/news/edit-requests/:id).
struct EditRequestReviewView: View {
    let id: String

    @State private var review: EditRequestReview?
    @State private var error: EditorialError?
    @State private var selected: Set<EditRequestField> = []
    @State private var updateLine = ""
    @State private var regenerate = true
    @State private var busy = false
    @State private var actionError: String?
    @State private var showReject = false
    @State private var rejectReason = ""
    @State private var doneMessage: String?

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: SabqLayout.space12) {
                if let review {
                    content(review)
                } else {
                    EditorialStatusView(error: error, loading: error == nil) { Task { await load() } }
                }
            }
            .padding(.horizontal, SabqLayout.pageMargin)
            .padding(.top, SabqLayout.space8)
            .padding(.bottom, 200)
        }
        .background(SabqTheme.background)
        .safeAreaInset(edge: .bottom) {
            if let review { actionBar(review) }
        }
        .sabqRTL()
        .navigationTitle("طلب تعديل")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .sheet(isPresented: $showReject) { rejectSheet }
    }

    @ViewBuilder
    private func content(_ review: EditRequestReview) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            Text([review.request.requesterName,
                  EditorialText.relative(review.request.createdAt),
                  review.article.status == "published" ? "على خبر منشور" : "على مسودة"]
                .filter { !$0.isEmpty }.joined(separator: " · "))
                .sabqText(SabqType.meta)
                .foregroundStyle(SabqTheme.textSecondary)
            Text(review.article.title)
                .sabqText(SabqType.leadTitle)
                .foregroundStyle(SabqTheme.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
            if let note = review.request.note, !note.isEmpty {
                Text("«\(note)»")
                    .sabqText(SabqType.excerpt)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .padding(SabqLayout.space12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(RoundedRectangle(cornerRadius: SabqRadius.medium).fill(SabqTheme.surfaceMuted))
            }
            if review.request.urgent {
                Text("عاجل").sabqText(SabqType.tag).foregroundStyle(SabqTheme.breaking)
            }
        }

        if !review.fields.isEmpty {
            VStack(spacing: 0) {
                ForEach(review.fields) { field in
                    if field != review.fields.first { Divider().overlay(SabqTheme.separator) }
                    fieldRow(field, review: review)
                }
            }
            .padding(.horizontal, SabqLayout.cardInset)
            .sabqNewsSurface()
        }

        if review.request.isPending && !review.fields.isEmpty {
            VStack(spacing: 0) {
                VStack(alignment: .leading, spacing: SabqLayout.space4) {
                    Text("سطر «تحديث:» للقارئ (اختياري)")
                        .sabqText(SabqType.meta)
                        .foregroundStyle(SabqTheme.textSecondary)
                    TextField("تحديث: عُدّل … وفق …", text: $updateLine)
                        .sabqText(SabqType.excerpt)
                }
                .padding(.vertical, SabqLayout.space12)
                Divider().overlay(SabqTheme.separator)
                Toggle(isOn: $regenerate) {
                    Text("أعد توليد الموجز والسيو")
                        .sabqText(SabqType.rowTitle)
                        .foregroundStyle(SabqTheme.textPrimary)
                }
                .tint(SabqTheme.actionFill)
                .frame(minHeight: 48)
            }
            .padding(.horizontal, SabqLayout.cardInset)
            .sabqNewsSurface()
        }

        if review.hasMissingParagraphs {
            Text("بعض الفقرات تغيّرت في الخبر منذ الطلب، ولن تُطبَّق إلا من محرر الويب.")
                .sabqText(SabqType.meta)
                .foregroundStyle(SabqTheme.warning)
        }
    }

    private func fieldRow(_ field: EditRequestField, review: EditRequestReview) -> some View {
        let isOn = selected.contains(field)
        return Button {
            guard review.request.isPending else { return }
            if isOn { selected.remove(field) } else { selected.insert(field) }
        } label: {
            HStack(alignment: .top, spacing: SabqLayout.space12) {
                Image(systemName: isOn ? "checkmark.square.fill" : "square")
                    .font(SabqFonts.app(size: 20, weight: .regular))
                    .foregroundStyle(isOn ? SabqTheme.primary : SabqTheme.outline)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: SabqLayout.space4) {
                    Text(field.title)
                        .sabqText(SabqType.metaEmphasis)
                        .foregroundStyle(SabqTheme.textSecondary)
                    fieldBody(field, review: review)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.vertical, SabqLayout.space12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isOn ? .isSelected : [])
    }

    @ViewBuilder
    private func fieldBody(_ field: EditRequestField, review: EditRequestReview) -> some View {
        let proposed = review.request.proposed
        switch field {
        case .title:
            beforeAfter(review.article.title, proposed.title)
        case .subtitle:
            beforeAfter(review.article.subtitle, proposed.subtitle)
        case .content:
            ForEach(review.contentEdits, id: \.self) { edit in
                beforeAfter(edit.before, edit.after.isEmpty ? "(حذف الفقرة)" : edit.after)
                if !edit.found {
                    Text("الفقرة لم تعد موجودة في الخبر")
                        .sabqText(SabqType.timestamp)
                        .foregroundStyle(SabqTheme.warning)
                }
            }
            if let append = proposed.appendParagraph, !append.isEmpty {
                Text("فقرة جديدة: \(append)")
                    .sabqText(SabqType.excerpt)
                    .foregroundStyle(SabqTheme.success)
                    .fixedSize(horizontal: false, vertical: true)
            }
        case .imageUrl:
            HStack(spacing: SabqLayout.space8) {
                EditorialThumbnail(url: EditorialURL.https(review.article.imageUrl), size: 56).opacity(0.5)
                Image(systemName: "arrow.left").foregroundStyle(SabqTheme.textTertiary)
                EditorialThumbnail(url: EditorialURL.https(proposed.imageUrl), size: 56)
            }
        case .albumImages:
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: SabqLayout.space8) {
                    ForEach(proposed.albumAdd ?? [], id: \.self) { url in
                        EditorialThumbnail(url: EditorialURL.https(url), size: 56)
                    }
                }
            }
        case .unknown:
            EmptyView()
        }
    }

    private func beforeAfter(_ before: String?, _ after: String?) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            if let before, !before.isEmpty {
                Text(before)
                    .sabqText(SabqType.excerpt)
                    .foregroundStyle(SabqTheme.textTertiary)
                    .strikethrough()
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let after, !after.isEmpty {
                Text(after)
                    .sabqText(SabqType.excerpt)
                    .foregroundStyle(SabqTheme.success)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    @ViewBuilder
    private func actionBar(_ review: EditRequestReview) -> some View {
        VStack(spacing: SabqLayout.space8) {
            if let doneMessage {
                Label(doneMessage, systemImage: "checkmark.circle.fill")
                    .sabqText(SabqType.rowTitle)
                    .foregroundStyle(SabqTheme.success)
                    .frame(maxWidth: .infinity, minHeight: SabqLayout.controlHeight)
            } else if review.request.isPending {
                if let actionError {
                    Text(actionError)
                        .sabqText(SabqType.meta)
                        .foregroundStyle(SabqTheme.danger)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                EditorialActionButton(
                    title: EditRequestReview.approveTitle(selected: selected.count, total: review.fields.count),
                    busy: busy,
                    enabled: !selected.isEmpty || review.fields.isEmpty
                ) { Task { await approve(review) } }
                EditorialActionButton(title: "ارفض مع سبب", style: .secondary, enabled: !busy) { showReject = true }
            } else {
                Text(review.request.status == "approved" ? "اعتُمد هذا الطلب" : "أُغلق هذا الطلب")
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .frame(maxWidth: .infinity, minHeight: SabqLayout.controlHeight)
            }
        }
        .padding(.horizontal, SabqLayout.pageMargin)
        .padding(.top, SabqLayout.space12)
        .padding(.bottom, SabqLayout.space8)
        .background(SabqTheme.surface.shadow(color: SabqTheme.shadow, radius: 12, y: -4))
    }

    private var rejectSheet: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: SabqLayout.space16) {
                Text("السبب يصل للمراسل مع الإشعار.")
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textSecondary)
                TextField("سبب الرفض", text: $rejectReason, axis: .vertical)
                    .lineLimit(3...8)
                    .sabqText(SabqType.excerpt)
                    .modifier(SabqInputSurface())
                EditorialActionButton(title: "ارفض الطلب", style: .danger, busy: busy,
                                      enabled: rejectReason.trimmingCharacters(in: .whitespacesAndNewlines).count >= 3) {
                    Task { await reject() }
                }
                Spacer()
            }
            .padding(SabqLayout.pageMargin)
            .navigationTitle("رفض الطلب")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("إلغاء") { showReject = false } } }
            .sabqRTL()
        }
        .presentationDetents([.medium, .large])
    }

    private func load() async {
        do {
            let data = try await EditorialAPI.editRequestReview(id: id)
            review = data
            selected = Set(data.fields)
            error = nil
        } catch let e as EditorialError {
            error = e
        } catch {
            self.error = .message(error.localizedDescription)
        }
    }

    private func approve(_ review: EditRequestReview) async {
        busy = true
        defer { busy = false }
        let all = selected.count == review.fields.count
        let ordered = review.fields.filter { selected.contains($0) }
        do {
            let result = try await EditorialAPI.approveEditRequest(
                id: id, fields: all ? nil : ordered, updateLine: updateLine, regenerate: regenerate
            )
            actionError = nil
            doneMessage = result.regenerating == true ? "طُبّق التعديل، والموجز والسيو قيد التوليد" : "طُبّق التعديل"
        } catch {
            actionError = error.localizedDescription
        }
    }

    private func reject() async {
        busy = true
        defer { busy = false }
        do {
            try await EditorialAPI.rejectEditRequest(id: id, reason: rejectReason.trimmingCharacters(in: .whitespacesAndNewlines))
            actionError = nil
            showReject = false
            doneMessage = "رُفض الطلب وأُبلغ المراسل"
        } catch {
            actionError = error.localizedDescription
            showReject = false
        }
    }
}
