"use client";
import { useState, useEffect } from "react";
import Image from "next/image";

import { countryCodeMapping } from "../../util/helpers/countryCodes";

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
            setSrc(null);
        }
    }, [countryCode])
    
    if (!src) {
        return null;
    }

    return (
        <Image
            src={src}
            alt={alt}
            width={40}
            height={30}
            priority
        />
    )
}