/** Official artwork, derived only from resources/branding/logo-official.png. */
export default function Brand({ full = false }: { full?: boolean }) {
  return full ? (
    <img className="brand-lockup" src="./branding/logo-lockup.png" width={1130} height={775} alt="GarageFlows Contract Generator" />
  ) : (
    <span className="brand-art" role="img" aria-label="GarageFlows Contract Generator">
      <img className="brand-emblem" src="./branding/icon.png" width={40} height={40} alt="" />
      <img className="brand-wordmark" src="./branding/wordmark.png" width={1130} height={175} alt="" />
    </span>
  );
}
