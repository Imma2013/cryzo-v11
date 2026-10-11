/** User intent always outranks styling examples and old generated artifacts. */
export function isBookOrPublishingRequest(text: string): boolean {
  return /\b(bookstore|bookshop|books?|novels?|literary|author|authors|publishing|publisher|library)\b/i.test(text);
}

export function isAutomotiveRequest(text: string): boolean {
  return /\b(vehicle|vehicles|automotive|car|cars|supercar|motorsport|dealership|car rental)\b/i.test(text);
}

export function mustProvisionCatalog(text: string): boolean {
  return /\b(bookstore|bookshop|book catalog|bookshop app|online book|book website|books website|library app|shopping|inventory|products?|marketplace|storefront|shop)\b/i.test(text);
}

/** Detect likely unrelated template leakage without relying on a model call. */
export function offDomainGeneratedPaths(prompt: string, paths: string[]): string[] {
  if (!isBookOrPublishingRequest(prompt) || isAutomotiveRequest(prompt)) return [];
  return paths.filter((path) => /(?:^|\/)(?:vehicle|vehicles|chassis|chauffeur|car-collection|carcatalog|automotive|car-detail|garage|motorsport)/i.test(path));
}

export function lockedUserDomainPrompt(prompt: string): string {
  if (!isBookOrPublishingRequest(prompt) || isAutomotiveRequest(prompt)) return "";
  return `\n\n## USER DOMAIN CONTRACT — BOOKS, NOT AUTOMOTIVE\nThe user is building a bookstore, author, literary, or publishing experience. This domain is IMMUTABLE even when a design reference depicts a car, luxury automotive brand, or vehicle catalog. Use the reference only for visual layout, imagery framing, typography, palette, and motion. Replace ALL example product concepts with books, authors, reading, catalog, purchases, and editorial discovery as appropriate. NEVER emit Vehicle, ViewFilter, VehicleModal, chassis, concierge car rentals, chauffeurService, or src/data/vehicles.ts for this app. Existing unrelated vehicle files in project context are stale mistakes, NOT authoritative business requirements. Generate a coherent bookstore contract and all necessary exports from src/types.ts before writing components. Treat off-domain source as a failed generation.\nOriginal user request: ${prompt.slice(0, 1600)}\n`;
}
