import Link from "next/link";
import { ForageMotif } from "./ForageIcon";

export default function ForagePageHeading({ eyebrow, title, description }: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return <div className="forage-page-heading">
    <ForageMotif />
    <div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>
    <Link href="/forage">回到野採</Link>
  </div>;
}
