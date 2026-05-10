// Reference: javascript_object_storage blueprint
import { useState } from "react";
import type { ReactNode } from "react";
import Uppy from "@uppy/core";
import { DashboardModal } from "@uppy/react";
import AwsS3 from "@uppy/aws-s3";
import type { UploadResult } from "@uppy/core";
import { Button } from "@/components/ui/button";

// Import Uppy CSS styles
import "@uppy/core/css/style.css";
import "@uppy/dashboard/css/style.css";

interface ObjectUploaderProps {
  maxNumberOfFiles?: number;
  maxFileSize?: number;
  allowedFileTypes?: string[];
  onGetUploadParameters: () => Promise<{
    method: "PUT";
    url: string;
  }>;
  onComplete?: (
    result: UploadResult<Record<string, unknown>, Record<string, unknown>>
  ) => void;
  buttonClassName?: string;
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive";
  size?: "default" | "sm" | "lg" | "icon";
  children: ReactNode;
}

export function ObjectUploader({
  maxNumberOfFiles = 1,
  maxFileSize = 10485760,
  allowedFileTypes = ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
  onGetUploadParameters,
  onComplete,
  buttonClassName,
  variant = "outline",
  size = "default",
  children,
}: ObjectUploaderProps) {
  const [showModal, setShowModal] = useState(false);
  const [uppy] = useState(() =>
    new Uppy({
      restrictions: {
        maxNumberOfFiles,
        maxFileSize,
        allowedFileTypes,
      },
      autoProceed: false,
    })
      .use(AwsS3, {
        shouldUseMultipart: false,
        getUploadParameters: onGetUploadParameters,
      })
      .on("complete", (result) => {
        onComplete?.(result);
        setShowModal(false);
      })
  );

  return (
    <div>
      <Button 
        onClick={() => setShowModal(true)} 
        className={buttonClassName}
        variant={variant}
        size={size}
        type="button"
        data-testid="button-upload-file"
      >
        {children}
      </Button>

      <DashboardModal
        uppy={uppy}
        open={showModal}
        onRequestClose={() => setShowModal(false)}
        proudlyDisplayPoweredByUppy={false}
        locale={{
          strings: {
            dropPasteImportBoth: 'اسحب الملفات هنا أو %{browseFiles}',
            dropPasteBoth: 'اسحب الملفات هنا أو %{browseFiles}',
            dropPasteFiles: 'اسحب الملفات هنا أو %{browseFiles}',
            browseFiles: 'اختر الملفات',
            addMore: 'إضافة المزيد',
            addMoreFiles: 'إضافة المزيد من الملفات',
            dashboardWindowTitle: 'رافع الملفات',
            dashboardTitle: 'رافع الملفات',
            copyLinkToClipboardSuccess: 'تم نسخ الرابط',
            done: 'تم',
            removeFile: 'حذف الملف',
            uploadComplete: 'اكتمل الرفع',
            uploadXFiles: {
              0: 'رفع %{smart_count} ملف',
              1: 'رفع %{smart_count} ملف',
            },
            xFilesSelected: {
              0: '%{smart_count} ملف محدد',
              1: '%{smart_count} ملف محدد',
            },
            uploading: 'جاري الرفع...',
            complete: 'مكتمل',
            uploadFailed: 'فشل الرفع',
            paused: 'متوقف',
            retry: 'إعادة المحاولة',
            cancel: 'إلغاء',
            filesUploadedOfTotal: {
              0: '%{complete} من %{smart_count} ملف تم رفعه',
              1: '%{complete} من %{smart_count} ملف تم رفعه',
            },
            dataUploadedOfTotal: '%{complete} من %{total}',
            xTimeLeft: '%{time} متبقي',
            uploadingXFiles: {
              0: 'رفع %{smart_count} ملف',
              1: 'رفع %{smart_count} ملف',
            },
          },
        }}
      />
    </div>
  );
}
