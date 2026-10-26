/**
 * What the design screens may call. The real BE (`origin/develop`) serves only the §2.2 endpoints;
 * the proposed ones of spec §7.2 exist in the mock alone, so a screen asks here before it offers
 * the feature, instead of calling a route that answers 404/405.
 */
export type DesignCapabilities = {
  /** P1 `POST /designs/mine`: a customer starts a design. */
  selfService: boolean;
  /** P3 `GET/PUT /designs/{id}/document`: the editable document is stored. */
  document: boolean;
  /** P4 `/designs/{id}/assets`: customer images are stored. */
  assets: boolean;
  /** P5 `POST /designs/{id}/technical-review-requests`: "please review" signal to QC. */
  reviewRequest: boolean;
  /** P6 `status` filter on `GET /designs`. */
  statusFilter: boolean;
};

/** Flip each flag when the BE ships that endpoint (spec §7.2); P2 needs none (read-only, PDP). */
export const PROPOSED_ENDPOINTS_LIVE: DesignCapabilities = {
  selfService: false,
  document: false,
  assets: false,
  reviewRequest: false,
  statusFilter: false,
};

export function designCapabilities(isMock: boolean): DesignCapabilities {
  if (isMock) {
    return {
      selfService: true,
      document: true,
      assets: true,
      reviewRequest: true,
      statusFilter: true,
    };
  }
  return { ...PROPOSED_ENDPOINTS_LIVE };
}
