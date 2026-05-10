import { PKPass } from 'passkit-generator';
import path from 'path';
import crypto from 'crypto';

export interface PassData {
  userId: string;
  serialNumber: string;
  authToken: string;
  userName: string;
  userEmail: string;
  userRole: string;
  profileImageUrl?: string;
}

export interface LoyaltyPassData extends PassData {
  totalPoints: number;
  currentRank: string;
  rankLevel: number;
  memberSince: Date;
}

export interface PressPassData extends PassData {
  jobTitle?: string;
  department?: string;
  pressIdNumber?: string;
  validUntil?: Date;
}

export interface CertificateConfig {
  signerCert: string;
  signerKey: string;
  wwdr: string;
  signerKeyPassphrase?: string;
}

export abstract class PassBuilder {
  protected passTypeId: string;
  protected teamId: string;
  
  constructor(passTypeId: string, teamId: string) {
    this.passTypeId = passTypeId;
    this.teamId = teamId;
  }
  
  abstract getTemplatePath(): string;
  abstract getPassDescription(): string;
  abstract getOrganizationName(): string;
  abstract configurePassFields(pass: PKPass, data: any): void;
  
  async generatePass(data: any, certificates: CertificateConfig): Promise<Buffer> {
    try {
      console.log('🔐 [PassBuilder] Generating pass with v3.x API...');
      console.log('✅ [PassBuilder] Certificate types:', {
        wwdr: typeof certificates.wwdr,
        signerCert: typeof certificates.signerCert,
        signerKey: typeof certificates.signerKey,
      });
      
      // Use v3.x API: PKPass.from() with all pass.json overrides
      const pass = await PKPass.from(
        {
          model: this.getTemplatePath(),
          certificates: {
            wwdr: certificates.wwdr,
            signerCert: certificates.signerCert,
            signerKey: certificates.signerKey,
            signerKeyPassphrase: certificates.signerKeyPassphrase,
          },
        },
        {
          serialNumber: data.serialNumber,
          description: this.getPassDescription(),
          organizationName: this.getOrganizationName(),
          passTypeIdentifier: this.passTypeId,
          teamIdentifier: this.teamId,
          authenticationToken: data.authToken,
          webServiceURL: process.env.FRONTEND_URL || 'https://sabq.org',
          backgroundColor: this.getBackgroundColor(),
          foregroundColor: 'rgb(255, 255, 255)',
          labelColor: 'rgb(255, 255, 255)',
        }
      );
      
      // Add barcode using setBarcodes method
      pass.setBarcodes({
        format: 'PKBarcodeFormatQR',
        message: data.userId,
        messageEncoding: 'iso-8859-1',
      });
      
      // Configure custom fields
      this.configurePassFields(pass, data);
      
      console.log('✅ [PassBuilder] Pass configured successfully');
      
      const buffer = pass.getAsBuffer();
      return buffer;
    } catch (error: any) {
      console.log('❌ [PassBuilder] PKPass error:', error);
      if (error.details) {
        console.log('❌ [PassBuilder] Validation details:', JSON.stringify(error.details, null, 2));
      }
      throw new Error(`Failed to generate pass: ${error.message}`);
    }
  }
  
  protected abstract getBackgroundColor(): string;
}
