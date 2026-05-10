import { Skeleton } from "@/components/ui/skeleton";

export function AuthFormSkeleton({ type = "login" }: { type?: "login" | "register" }) {
  return (
    <div className="flex flex-col flex-1">
      <div className="w-full max-w-md pt-10 mx-auto">
        <Skeleton className="h-5 w-32" />
      </div>
      
      <div className="flex flex-col justify-center flex-1 w-full max-w-md mx-auto">
        <div className="mb-5 sm:mb-8">
          <Skeleton className="h-8 w-40 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-5">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>

          <div className="relative my-6">
            <Skeleton className="h-px w-full" />
          </div>

          <div className="space-y-5">
            {type === "register" && (
              <div className="grid grid-cols-2 gap-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            )}
            
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            
            {type === "register" && (
              <Skeleton className="h-10 w-full" />
            )}
            
            {type === "register" && (
              <Skeleton className="h-16 w-full" />
            )}
            
            <Skeleton className="h-11 w-full" />
          </div>
        </div>
        
        <div className="mt-5">
          <Skeleton className="h-4 w-full" />
        </div>
      </div>
    </div>
  );
}
