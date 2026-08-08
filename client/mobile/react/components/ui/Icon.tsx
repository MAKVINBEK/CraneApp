// components/Icon.tsx
import { cn } from "@/utils";
import type { SVGProps } from "react";

// Список иконок, работающих через заливку
const FILLED_ICONS = ["reply", "edit", "trash", "phone", "video", "copy"];

interface Props extends SVGProps<SVGSVGElement> {
	name: "forward" | "reply" | "edit" | "trash" | "phone" | "video" | "copy";
	className: string;
	size: number;
}

export const Icon = ({ name, size = 24, className = "", ...props }: Props) => {
	const isFilled = FILLED_ICONS.includes(name);
	return (
		<svg
			width={size}
			height={size}
			className={cn("opacity-90", className)}
			aria-hidden="true"
			fill={isFilled ? "currentColor" : "none"}
			stroke={isFilled ? "none" : "currentColor"}
			strokeWidth={isFilled ? undefined : "2"}
			strokeLinecap={isFilled ? undefined : "round"}
			strokeLinejoin={isFilled ? undefined : "round"}
			{...props}
		>
			<use href={`/sprite.svg#icon-${name}`} />
		</svg>
	);
};
