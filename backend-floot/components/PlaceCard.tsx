import { Navigation, Phone } from "lucide-react";
import { Button } from "./Button";
import { navigationLinks } from "../helpers/navigationLinks";
import type { Place } from "../endpoints/assistant/chat_POST.schema";
import styles from "./PlaceCard.module.css";

interface PlaceCardProps {
  place: Place;
  highlighted?: boolean;
  className?: string;
}

export function PlaceCard({ place, highlighted, className }: PlaceCardProps) {
  const open = (url: string) => window.open(url, "_blank", "noopener");
  return (
    <article className={`${styles.card} ${highlighted ? styles.highlighted : ""} ${className ?? ""}`}>
      <div className={styles.head}>
        <h3 className={styles.name}>{place.name}</h3>
        {place.distanceMeters != null && (
          <span className={styles.distance}>{navigationLinks.formatDistance(place.distanceMeters)}</span>
        )}
      </div>
      {place.address && <p className={styles.address}>{place.address}</p>}
      {place.openingHours && <p className={styles.hours}>{place.openingHours}</p>}
      <div className={styles.actions}>
        <Button
          size="lg"
          className={styles.navigate}
          onClick={() => open(navigationLinks.googleMaps(place.lat, place.lng))}
        >
          <Navigation size={22} /> Navegar
        </Button>
        <Button
          size="lg"
          variant="secondary"
          onClick={() => open(navigationLinks.waze(place.lat, place.lng))}
        >
          Waze
        </Button>
        {place.phone && (
          <Button size="icon-lg" variant="secondary" asChild>
            <a href={`tel:${place.phone}`} aria-label={`Llamar a ${place.name}`}>
              <Phone size={22} />
            </a>
          </Button>
        )}
      </div>
    </article>
  );
}
