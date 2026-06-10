// Apple Wallet passes (press cards + loyalty cards) — issue, refresh, and
// the PassKit web-service endpoints (device register/unregister, updated
// passes, pass delivery). Extracted verbatim from server/routes.ts on
// 2026-06-10 (Milestone-2 extraction #6, audit T2.2). ADR-001-compliant:
// storage-only data access; .pkpass generation via lib/passkit.
import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth } from "../rbac";
import { passKitService, type PressPassData, type LoyaltyPassData } from "../lib/passkit/PassKitService";

export function registerWalletRoutes(app: Express) {
  // ============================================================
  // APPLE WALLET ROUTES
  // ============================================================

  // ============================================================
  // PRESS CARD ENDPOINTS (Admin-Only)
  // ============================================================

  // Issue press card - requires hasPressCard flag
  app.post("/api/wallet/press/issue", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      
      // Check if user is authorized for press card
      if (!req.user.hasPressCard) {
        return res.status(403).json({ 
          error: 'غير مصرح لك بإصدار بطاقة صحفية. يرجى التواصل مع الإدارة.' 
        });
      }
      
      // Check if pass already exists
      let existingPass = await storage.getWalletPassByUserAndType(userId, 'press');
      
      if (existingPass) {
        // Regenerate existing pass
    try {
          const passData: PressPassData = {
            userId: req.user.id,
            serialNumber: existingPass.serialNumber,
            authToken: existingPass.authenticationToken,
            userName: `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.email,
            userEmail: req.user.email,
            userRole: req.user.role || 'reader',
            profileImageUrl: req.user.profileImageUrl,
            jobTitle: req.user.jobTitle,
            department: req.user.department,
            pressIdNumber: req.user.pressIdNumber,
            validUntil: req.user.cardValidUntil,
          };
          
          const passBuffer = await passKitService.generatePressPass(passData);
          
          // Update timestamp
          await storage.updateWalletPassTimestamp(existingPass.id);
          
          res.set({
            'Content-Type': 'application/vnd.apple.pkpass',
            'Content-Disposition': `attachment; filename="sabq-press-card-${existingPass.serialNumber}.pkpass"`,
            'Content-Length': passBuffer.length,
          });
          
          return res.send(passBuffer);
        } catch (error: any) {
          console.error('❌ [Press Card] Generation failed:', error);
          return res.status(400).json({ 
            error: error.message || 'تعذر إنشاء البطاقة. يرجى التحقق من إعدادات Apple Wallet.',
          });
        }
      }
      
      // Create new pass
      const serialNumber = passKitService.generateSerialNumber(userId, 'press');
      const authToken = passKitService.generateAuthToken();
      
      const passData: PressPassData = {
        userId: req.user.id,
        serialNumber,
        authToken,
        userName: `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.email,
        userEmail: req.user.email,
        userRole: req.user.role || 'reader',
        profileImageUrl: req.user.profileImageUrl,
        jobTitle: req.user.jobTitle,
        department: req.user.department,
        pressIdNumber: req.user.pressIdNumber,
        validUntil: req.user.cardValidUntil,
      };
      
    try {
        const passBuffer = await passKitService.generatePressPass(passData);
        
        // Save to database AFTER successful generation
        await storage.createWalletPass({
          userId,
          passType: 'press',
          passTypeIdentifier: process.env.APPLE_PRESS_PASS_TYPE_ID || 'pass.life.sabq.presscard',
          serialNumber,
          authenticationToken: authToken,
        });
        
        console.log('✅ [Press Card] Issued successfully for user:', userId);
        
        res.set({
          'Content-Type': 'application/vnd.apple.pkpass',
          'Content-Disposition': `attachment; filename="sabq-press-card-${serialNumber}.pkpass"`,
          'Content-Length': passBuffer.length,
        });
        
        res.send(passBuffer);
      } catch (error: any) {
        console.error('❌ [Press Card] Generation failed:', error);
        res.status(400).json({ 
          error: error.message || 'تعذر إنشاء البطاقة. يرجى التحقق من إعدادات Apple Wallet.',
        });
      }
    } catch (error: any) {
      console.error('❌ [Press Card] Issue error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // Get press card status
  app.get("/api/wallet/press/status", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      
      // Check if user is authorized
      if (!req.user.hasPressCard) {
        return res.json({ 
          hasPass: false,
          authorized: false,
          message: 'غير مصرح لك بإصدار بطاقة صحفية',
        });
      }
      
      const pass = await storage.getWalletPassByUserAndType(userId, 'press');
      
      if (!pass) {
        return res.json({ 
          hasPass: false,
          authorized: true,
        });
      }
      
      res.json({
        hasPass: true,
        authorized: true,
        serialNumber: pass.serialNumber,
        lastUpdated: pass.lastUpdated,
        createdAt: pass.createdAt,
      });
    } catch (error: any) {
      console.error('❌ [Press Card] Status check error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // ============================================================
  // LOYALTY CARD ENDPOINTS (All Users)
  // ============================================================

  // Issue loyalty card - all authenticated users
  app.post("/api/wallet/loyalty/issue", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      
      // Get or create user points
      let userPoints = await storage.getUserPointsTotal(userId);
      if (!userPoints) {
        userPoints = await storage.createUserPointsTotal(userId);
      }
      
      // Check if pass already exists
      let existingPass = await storage.getWalletPassByUserAndType(userId, 'loyalty');
      
      if (existingPass) {
        // Regenerate with latest points
    try {
          const passData: LoyaltyPassData = {
            userId: req.user.id,
            serialNumber: existingPass.serialNumber,
            authToken: existingPass.authenticationToken,
            userName: `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.email,
            userEmail: req.user.email,
            userRole: req.user.role || 'reader',
            profileImageUrl: req.user.profileImageUrl,
            totalPoints: userPoints.totalPoints,
            currentRank: userPoints.currentRank,
            rankLevel: userPoints.rankLevel,
            memberSince: userPoints.createdAt,
          };
          
          const passBuffer = await passKitService.generateLoyaltyPass(passData);
          
          // Update timestamp
          await storage.updateWalletPassTimestamp(existingPass.id);
          
          res.set({
            'Content-Type': 'application/vnd.apple.pkpass',
            'Content-Disposition': `attachment; filename="sabq-loyalty-card-${existingPass.serialNumber}.pkpass"`,
            'Content-Length': passBuffer.length,
          });
          
          return res.send(passBuffer);
        } catch (error: any) {
          console.error('❌ [Loyalty Card] Generation failed:', error);
          return res.status(400).json({ 
            error: error.message || 'تعذر إنشاء بطاقة العضوية. يرجى المحاولة لاحقاً.',
          });
        }
      }
      
      // Create new pass
      const serialNumber = passKitService.generateSerialNumber(userId, 'loyalty');
      const authToken = passKitService.generateAuthToken();
      
      const passData: LoyaltyPassData = {
        userId: req.user.id,
        serialNumber,
        authToken,
        userName: `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.email,
        userEmail: req.user.email,
        userRole: req.user.role || 'reader',
        profileImageUrl: req.user.profileImageUrl,
        totalPoints: userPoints.totalPoints,
        currentRank: userPoints.currentRank,
        rankLevel: userPoints.rankLevel,
        memberSince: userPoints.createdAt,
      };
      
    try {
        const passBuffer = await passKitService.generateLoyaltyPass(passData);
        
        // Save to database AFTER successful generation
        await storage.createWalletPass({
          userId,
          passType: 'loyalty',
          passTypeIdentifier: process.env.APPLE_LOYALTY_PASS_TYPE_ID || 'pass.life.sabq.loyalty',
          serialNumber,
          authenticationToken: authToken,
        });
        
        console.log('✅ [Loyalty Card] Issued successfully for user:', userId);
        
        res.set({
          'Content-Type': 'application/vnd.apple.pkpass',
          'Content-Disposition': `attachment; filename="sabq-loyalty-card-${serialNumber}.pkpass"`,
          'Content-Length': passBuffer.length,
        });
        
        res.send(passBuffer);
      } catch (error: any) {
        console.error('❌ [Loyalty Card] Generation failed:', error);
        res.status(400).json({ 
          error: error.message || 'تعذر إنشاء بطاقة العضوية. يرجى المحاولة لاحقاً.',
        });
      }
    } catch (error: any) {
      console.error('❌ [Loyalty Card] Issue error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // Get loyalty card status with points data
  app.get("/api/wallet/loyalty/status", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      
      // Get user points
      const userPoints = await storage.getUserPointsTotal(userId);
      
      const pass = await storage.getWalletPassByUserAndType(userId, 'loyalty');
      
      res.json({
        hasPass: !!pass,
        ...(pass && {
          serialNumber: pass.serialNumber,
          lastUpdated: pass.lastUpdated,
          createdAt: pass.createdAt,
        }),
        points: userPoints ? {
          total: userPoints.totalPoints,
          rank: userPoints.currentRank,
          level: userPoints.rankLevel,
          lifetime: userPoints.lifetimePoints,
        } : null,
      });
    } catch (error: any) {
      console.error('❌ [Loyalty Card] Status check error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // PassKit Web Service: Register device
  app.post("/api/wallet/v1/devices/:deviceLibraryId/registrations/:passTypeId/:serialNumber", 
    async (req, res) => {
    try {
        const { deviceLibraryId, passTypeId, serialNumber } = req.params;
        const { pushToken } = req.body;

        const pass = await storage.getWalletPassBySerial(serialNumber);
        if (!pass) {
          return res.status(404).json({ error: 'Pass not found' });
        }

        await storage.registerDevice({
          passId: pass.id,
          deviceLibraryIdentifier: deviceLibraryId,
          pushToken,
        });

        res.status(201).end();
      } catch (error: any) {
        console.error('Error registering device:', error);
        res.status(500).json({ error: error.message });
      }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // PassKit Web Service: Get updatable passes
  app.get("/api/wallet/v1/devices/:deviceLibraryId/registrations/:passTypeId", 
    async (req, res) => {
    try {
        const { deviceLibraryId, passTypeId } = req.params;
        const passesUpdatedSince = req.query.passesUpdatedSince as string | undefined;
        
        const serialNumbers = await storage.getUpdatedPasses(deviceLibraryId, passTypeId, passesUpdatedSince);

        if (serialNumbers.length === 0) {
          return res.status(204).end();
        }

      res.json({
          serialNumbers,
          lastUpdated: new Date().toISOString(),
        });
      } catch (error: any) {
        console.error('Error getting updated passes:', error);
        res.status(500).json({ error: error.message });
      }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // PassKit Web Service: Unregister device
  app.delete("/api/wallet/v1/devices/:deviceLibraryId/registrations/:passTypeId/:serialNumber",
    async (req, res) => {
    try {
        const { deviceLibraryId, serialNumber } = req.params;
        
        const pass = await storage.getWalletPassBySerial(serialNumber);
        if (!pass) {
          return res.status(404).json({ error: 'Pass not found' });
        }

        await storage.unregisterDevice(pass.id, deviceLibraryId);
        res.status(200).end();
      } catch (error: any) {
        console.error('Error unregistering device:', error);
        res.status(500).json({ error: error.message });
      }
  });

  // News Analytics Endpoint - Smart statistics and insights
}
