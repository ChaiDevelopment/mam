import { Injectable } from '@nestjs/common';
import type { DeliveryProvider, PlatformAvailability } from '@mam/shared-types';
import { env } from '../../config/env';

/**
 * Extensible adapter contract for external food-delivery platforms.
 *
 * MAM! is NOT a delivery marketplace. These platforms are information sources and outbound
 * destinations only. GoFood, GrabFood and ShopeeFood do not offer public restaurant-search APIs;
 * partner APIs require a signed agreement and their endpoints are not public. Until such access
 * exists, adapters report NOT_INTEGRATED and MAM! relies on admin-verified or user-submitted links.
 * We never scrape, call undocumented endpoints, or fabricate menus, prices or availability.
 */
export interface FoodPlatformProvider {
  readonly id: DeliveryProvider;
  getProviderName(): string;
  /** True only when authorized partner access is configured AND an implementation exists. */
  isIntegrated(): boolean;
  /** Allowed official hostnames for outbound links (used to validate submitted URLs). */
  officialHosts(): string[];
  searchRestaurant(query: { name: string; lat: number; lng: number }): Promise<{ url: string; externalId: string }[]>;
  getRestaurantUrl(externalId: string): string | null;
  getAvailabilityStatus(): PlatformAvailability;
  getLastVerifiedAt(): Date | null;
}

export class ProviderNotIntegratedError extends Error {
  constructor(provider: string) {
    super(`${provider}: no authorized API integration is configured`);
  }
}

abstract class PartnerApiProvider implements FoodPlatformProvider {
  abstract readonly id: DeliveryProvider;
  abstract getProviderName(): string;
  abstract officialHosts(): string[];
  protected abstract partnerKey(): string | undefined;

  isIntegrated(): boolean {
    // A partner key alone is not enough: an implementation against the provider's documented
    // partner API must be added here once the agreement and documentation are available.
    return false;
  }

  partnerKeyConfigured(): boolean {
    return !!this.partnerKey();
  }

  async searchRestaurant(_query: { name: string; lat: number; lng: number }): Promise<{ url: string; externalId: string }[]> {
    throw new ProviderNotIntegratedError(this.getProviderName());
  }

  getRestaurantUrl(_externalId: string): string | null {
    return null;
  }

  getAvailabilityStatus(): PlatformAvailability {
    return 'NOT_INTEGRATED';
  }

  getLastVerifiedAt(): Date | null {
    return null;
  }
}

export class GoFoodProvider extends PartnerApiProvider {
  readonly id = 'GOFOOD' as const;
  getProviderName() {
    return 'GoFood';
  }
  officialHosts() {
    return ['gofood.co.id', 'gojek.com', 'gojek.link'];
  }
  protected partnerKey() {
    return env().GOFOOD_PARTNER_API_KEY;
  }
}

export class GrabFoodProvider extends PartnerApiProvider {
  readonly id = 'GRABFOOD' as const;
  getProviderName() {
    return 'GrabFood';
  }
  officialHosts() {
    return ['food.grab.com', 'grab.com', 'r.grab.com'];
  }
  protected partnerKey() {
    return env().GRABFOOD_PARTNER_API_KEY;
  }
}

export class ShopeeFoodProvider extends PartnerApiProvider {
  readonly id = 'SHOPEEFOOD' as const;
  getProviderName() {
    return 'ShopeeFood';
  }
  officialHosts() {
    return ['shopee.co.id', 'shopeefood.co.id', 'shp.ee'];
  }
  protected partnerKey() {
    return env().SHOPEEFOOD_PARTNER_API_KEY;
  }
}

@Injectable()
export class FoodPlatformRegistry {
  private readonly providers: PartnerApiProvider[] = [new GoFoodProvider(), new GrabFoodProvider(), new ShopeeFoodProvider()];

  all(): PartnerApiProvider[] {
    return this.providers;
  }

  get(id: DeliveryProvider): PartnerApiProvider {
    const p = this.providers.find((x) => x.id === id);
    if (!p) throw new Error(`Unknown provider ${id}`);
    return p;
  }

  /** Validates that a URL points at the provider's official domain over HTTPS. */
  isOfficialUrl(id: DeliveryProvider, url: string): boolean {
    try {
      const u = new URL(url);
      if (u.protocol !== 'https:') return false;
      const host = u.hostname.toLowerCase();
      return this.get(id)
        .officialHosts()
        .some((h) => host === h || host.endsWith(`.${h}`));
    } catch {
      return false;
    }
  }
}
