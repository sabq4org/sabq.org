import sabqLogo from "@assets/sabq-logo.png";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-background" dir="rtl">
      <div className="flex flex-col lg:flex-row min-h-screen">
        {/* Right Side - Form Content */}
        <div className="flex flex-col w-full lg:w-1/2 overflow-y-auto px-4 sm:px-6 md:px-8">
          {children}
        </div>
        
        {/* Left Side - Branding Panel (hidden on mobile) */}
        <div className="hidden lg:flex w-1/2 bg-gradient-to-br from-[#4A90E2] via-[#5B9FED] to-[#6DAEF8] items-center justify-center p-8">
          <div className="text-center text-white space-y-6 max-w-md">
            <img 
              src={sabqLogo} 
              alt="سبق" 
              className="w-48 lg:w-56 xl:w-64 mx-auto brightness-0 invert"
              style={{ filter: 'brightness(0) invert(1)' }}
              loading="lazy"
            />
            <h2 className="text-xl lg:text-2xl font-semibold">حيث تلتقي الثقة بالمصداقية</h2>
            <p className="text-base lg:text-lg opacity-90">صحافة ذكية. مستقبل مشرق.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
