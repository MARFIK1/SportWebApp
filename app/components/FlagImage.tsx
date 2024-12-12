"use client";
import { useState, useEffect } from "react";
import Image from "next/image";

import { countryCodeMapping } from "../util/countryCodes";

type PageProps = {
    countryCode: string,
    alt: string
}

export default function FlagImage({ countryCode, alt } : PageProps) {
    const [src, setSrc] = useState<string | null>(null);

    useEffect(() => {
        const mappedCode = countryCode?.toLowerCase() ? countryCodeMapping[countryCode.toLowerCase()] : null;
        if (mappedCode) {
            setSrc(`https://flagcdn.com/h80/${mappedCode.toLowerCase()}.png`);
        }
        else {
            setSrc("/default-flag.png");
        }
    }, [countryCode])
    
    return (
        <Image
            src={src || "/default-flag.png"}
            alt={alt}
            width={40}
            height={30}
            onError={() => setSrc("/default-flag.png")}
            priority
        />
    )
}