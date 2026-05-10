import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility Tests (WCAG 2.1 AA)', () => {
  
  test('Homepage should not have any automatically detectable accessibility issues', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('Article detail page should not have accessibility violations', async ({ page }) => {
    // Navigate to homepage first to get an article
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Click on first article if available
    const articleLink = page.locator('a[data-testid^="link-article-"]').first();
    if (await articleLink.count() > 0) {
      await articleLink.click();
      await page.waitForLoadState('networkidle');
      
      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      expect(accessibilityScanResults.violations).toEqual([]);
    }
  });

  test('Login page should not have accessibility violations', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('Accessibility Settings dialog should be accessible', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Open accessibility settings
    const accessibilityButton = page.locator('[data-testid="button-accessibility-settings-desktop"]');
    await accessibilityButton.click();
    
    // Wait for dialog to appear
    await page.waitForSelector('[role="dialog"]', { state: 'visible' });
    
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('Skip links should be keyboard accessible and functional', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Tab to first skip link
    await page.keyboard.press('Tab');
    
    // Check if skip link is focused
    const skipLink = page.locator('a[data-testid="skip-link-main"]');
    await expect(skipLink).toBeFocused();
    
    // Press Enter to activate skip link
    await page.keyboard.press('Enter');
    
    // Verify focus moved to main content
    const mainContent = page.locator('#main-content');
    await expect(mainContent).toBeFocused();
    
    // Run accessibility scan
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('Live regions should be present and properly configured', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Check for polite live region
    const politeLiveRegion = page.locator('[data-testid="live-region-polite"]');
    await expect(politeLiveRegion).toHaveAttribute('aria-live', 'polite');
    await expect(politeLiveRegion).toHaveAttribute('role', 'status');
    
    // Check for assertive live region
    const assertiveLiveRegion = page.locator('[data-testid="live-region-assertive"]');
    await expect(assertiveLiveRegion).toHaveAttribute('aria-live', 'assertive');
    await expect(assertiveLiveRegion).toHaveAttribute('role', 'alert');
  });

  test('Focus indicators should be visible when using keyboard navigation', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Tab through interactive elements
    await page.keyboard.press('Tab'); // Skip to main content link
    await page.keyboard.press('Tab'); // Skip to navigation link  
    await page.keyboard.press('Tab'); // Skip to footer link
    await page.keyboard.press('Tab'); // First actual focusable element
    
    // Get the currently focused element
    const focusedElement = await page.evaluateHandle(() => document.activeElement);
    
    // Check if it has visible focus styles (ring-2 from Tailwind)
    const hasVisibleFocus = await page.evaluate((el) => {
      const computed = window.getComputedStyle(el as Element);
      // Check for outline or box-shadow (focus ring)
      return (
        computed.outline !== 'none' ||
        computed.outlineWidth !== '0px' ||
        computed.boxShadow.includes('rgb') // Tailwind ring creates box-shadow
      );
    }, focusedElement);
    
    expect(hasVisibleFocus).toBe(true);
  });

  test('High contrast mode should apply when enabled', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Open accessibility settings
    const accessibilityButton = page.locator('[data-testid="button-accessibility-settings-desktop"]');
    await accessibilityButton.click();
    
    // Enable high contrast
    const highContrastToggle = page.locator('[data-testid="toggle-high-contrast"]');
    await highContrastToggle.click();
    
    // Check if html element has high-contrast class
    const htmlElement = page.locator('html');
    await expect(htmlElement).toHaveClass(/high-contrast/);
    await expect(htmlElement).toHaveAttribute('data-high-contrast', 'true');
  });

  test('Font size changes should apply correctly', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Open accessibility settings
    const accessibilityButton = page.locator('[data-testid="button-accessibility-settings-desktop"]');
    await accessibilityButton.click();
    
    // Change to large font
    const fontSizeSelect = page.locator('[data-testid="select-font-size"]');
    await fontSizeSelect.click();
    
    const largeOption = page.locator('[data-testid="font-size-option-large"]');
    await largeOption.click();
    
    // Check if html element has font-large class
    const htmlElement = page.locator('html');
    await expect(htmlElement).toHaveClass(/font-large/);
    await expect(htmlElement).toHaveAttribute('data-font-size', 'large');
  });

  test('Reduce motion should disable animations', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Open accessibility settings
    const accessibilityButton = page.locator('[data-testid="button-accessibility-settings-desktop"]');
    await accessibilityButton.click();
    
    // Enable reduce motion
    const reduceMotionToggle = page.locator('[data-testid="toggle-reduce-motion"]');
    await reduceMotionToggle.click();
    
    // Check if html element has reduce-motion class
    const htmlElement = page.locator('html');
    await expect(htmlElement).toHaveClass(/reduce-motion/);
    await expect(htmlElement).toHaveAttribute('data-reduce-motion', 'true');
  });

  test('Category pages should maintain accessibility', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Click on first category link if available
    const categoryLink = page.locator('a[href^="/category/"]').first();
    if (await categoryLink.count() > 0) {
      await categoryLink.click();
      await page.waitForLoadState('networkidle');
      
      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      expect(accessibilityScanResults.violations).toEqual([]);
    }
  });

  test('External announcements via announceToScreenReader should work', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Test external announcement API
    const testMessage = 'External test announcement via custom event';
    
    await page.evaluate((msg) => {
      window.dispatchEvent(
        new CustomEvent('a11y:announce', {
          detail: { message: msg, priority: 'polite' },
        })
      );
    }, testMessage);
    
    // Wait for announcement to appear in live region
    await page.waitForTimeout(500);
    
    // Check if message appears in polite live region
    const politeRegion = page.locator('[data-testid="live-region-polite"]');
    const content = await politeRegion.textContent();
    
    expect(content).toContain(testMessage);
  });

  test('Toast announcements should only fire once per toast lifecycle', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    
    // Track aria-live announcements
    const announcements: string[] = [];
    
    // Listen for mutations in live regions
    await page.evaluate(() => {
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            mutation.addedNodes.forEach((node) => {
              if (node.textContent && node.textContent.trim()) {
                (window as any).__announcements = (window as any).__announcements || [];
                (window as any).__announcements.push(node.textContent.trim());
              }
            });
          }
        });
      });
      
      const politeRegion = document.querySelector('[data-testid="live-region-polite"]');
      const assertiveRegion = document.querySelector('[data-testid="live-region-assertive"]');
      
      if (politeRegion) observer.observe(politeRegion, { childList: true, subtree: true });
      if (assertiveRegion) observer.observe(assertiveRegion, { childList: true, subtree: true });
    });
    
    // Trigger a toast by submitting login form with invalid credentials
    const emailInput = page.locator('input[name="email"]');
    const passwordInput = page.locator('input[name="password"]');
    const submitButton = page.locator('button[type="submit"]');
    
    await emailInput.fill('invalid@example.com');
    await passwordInput.fill('wrongpassword');
    await submitButton.click();
    
    // Wait for toast to appear
    await page.waitForTimeout(2000); // Give time for any potential duplicate announcements
    
    // Check announcements
    const recordedAnnouncements = await page.evaluate(() => (window as any).__announcements || []);
    
    // Count how many times the same error message was announced
    const errorAnnouncements = recordedAnnouncements.filter((msg: string) => 
      msg.includes('خطأ') || msg.includes('error') || msg.includes('invalid')
    );
    
    // Each unique toast should only be announced once
    const uniqueAnnouncements = new Set(errorAnnouncements);
    expect(errorAnnouncements.length).toBe(uniqueAnnouncements.size);
  });
});
