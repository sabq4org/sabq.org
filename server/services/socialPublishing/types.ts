// عقد مزود منصة النشر الاجتماعي — v1 يطبقه X فقط.
// إضافة منصة جديدة = تطبيق جديد لهذا العقد + صف حساب platform جديد،
// دون المساس بالخدمة أو العامل أو الواجهة.

export interface ProviderIdentity {
  externalAccountId: string;
  handle: string;
  displayName: string;
}

export interface ProviderPostResult {
  externalPostId: string;
  externalPostUrl: string;
}

/** خطأ مزود مصنَّف — retryable يقود قرار إعادة المحاولة في العامل */
export class SocialProviderError extends Error {
  constructor(
    message: string,
    public readonly opts: {
      httpStatus?: number;
      errorCode?: string;
      retryable: boolean;
      /** يعني أن اعتماد الحساب لم يعد صالحاً — يُعلَّم الحساب expired */
      credentialsInvalid?: boolean;
    },
  ) {
    super(message);
    this.name = "SocialProviderError";
  }
}

export interface SocialPublishProvider {
  readonly platform: string;
  /** هوية الحساب المرتبط — تُستخدم عند الربط وللتحقق الدوري */
  verifyIdentity(accountId: string): Promise<ProviderIdentity>;
  /** يرفع صورة ويعيد معرف الوسائط لدى المنصة */
  uploadImage(accountId: string, image: { buffer: Buffer; mimeType: string }): Promise<string>;
  /**
   * يرفع فيديو من رابط عام ويعيد معرف الوسائط — اختياري:
   * v1 يطبقه Publer فقط (from-url)؛ غيابه = الفيديو غير مدعوم للوسيلة.
   */
  uploadVideoFromUrl?(accountId: string, url: string): Promise<string>;
  /** ينشئ المنشور ويعيد معرفه ورابطه */
  createPost(
    accountId: string,
    input: { text: string; mediaIds?: string[]; videoMediaId?: string },
  ): Promise<ProviderPostResult>;
}
