import React, { useState } from "react";
import { ActionPanel, Action, List, Icon, Image } from "@raycast/api";
import { rgb, p3, parse, formatRgb, formatHex, hsl, oklch, oklab } from "culori";

type ColorFormat = "rgb" | "hex" | "hsl" | "p3" | "oklch" | "oklab" | "vec" | "figma";

interface ColorData {
  format: ColorFormat;
  value: string;
  hexValue: string;
}

function round(value: number | undefined, decimals: number): number {
  if (value === undefined) return 0;
  return Number(value.toFixed(decimals));
}

function formatColor(color: ReturnType<typeof parse>, format: ColorFormat): string {
  if (!color) return "Invalid color";

  switch (format) {
    case "rgb":
      return formatRgb(color);
    case "hex":
      return formatHex(color).toUpperCase();
    case "hsl": {
      const hslColor = hsl(color);
      const { h, s, l, alpha } = hslColor;
      return `hsl(${round(h, 2)} ${round(s * 100, 1)}% ${round(l * 100, 1)}%${alpha !== undefined && alpha < 1 ? ` / ${round(alpha, 3)}` : ''})`;
    }
    case "oklch": {
      const { l, c, h, alpha } = oklch(color);
      return `oklch(${round(l * 100, 2)}% ${round(c, 3)} ${round(h, 2)}${alpha !== undefined && alpha < 1 ? ` / ${round(alpha, 3)}` : ''})`;
    }
    case "oklab": {
      const { l, a, b, alpha } = oklab(color);
      return `oklab(${round(l * 100, 2)}% ${round(a, 2)} ${round(b, 2)}${alpha !== undefined && alpha < 1 ? ` / ${round(alpha, 3)}` : ''})`;
    }
    case "p3": {
      const { r, g, b, alpha } = p3(color);
      return `color(display-p3 ${round(r, 4)} ${round(g, 4)} ${round(b, 4)}${alpha !== undefined && alpha < 1 ? ` / ${round(alpha, 3)}` : ''})`;
    }
    case "vec": {
      const { r, g, b } = rgb(color);
      const toLinear = (x: number) => x > 0.04045 ? Math.pow((x + 0.055) / 1.055, 2.4) : x / 12.92;
      return `Linear RGB vec(${round(toLinear(r), 5)}, ${round(toLinear(g), 5)}, ${round(toLinear(b), 5)})`;
    }
    case "figma": {
      const p3Color = p3(color);
      return formatHex(p3Color).toUpperCase() + "FF";
    }
    default:
      return "Unsupported format";
  }
}

function ColorPreviewIcon({ hexValue }: { hexValue: string }): Image.ImageLike {
  return {
    source: Icon.CircleFilled,
    tintColor: {
      light: hexValue,
      dark: hexValue,
      adjustContrast: false,
    },
  };
}

export default function Command() {
  const [, setInputColor] = useState("");
  const [convertedColors, setConvertedColors] = useState<ColorData[]>([]);
  const [inputFormat, setInputFormat] = useState<ColorFormat>("rgb");

  const handleColorConversion = (input: string) => {
    const parsedColor = parse(input);
    if (parsedColor) {
      const hexColor = formatHex(parsedColor).toUpperCase();
      const formats: ColorFormat[] = ["rgb", "hex", "hsl", "p3", "oklch", "oklab", "vec", "figma"];
      const formattedColors: ColorData[] = formats.map((format) => ({
        format,
        value: formatColor(parsedColor, format),
        hexValue: hexColor
      }));
      setConvertedColors(formattedColors);

      if (input.startsWith("#")) {
        setInputFormat("hex");
      } else if (input.startsWith("rgb")) {
        setInputFormat("rgb");
      } else if (input.startsWith("hsl")) {
        setInputFormat("hsl");
      } else if (input.startsWith("oklch")) {
        setInputFormat("oklch");
      } else if (input.startsWith("oklab")) {
        setInputFormat("oklab");
      } else if (input.startsWith("color(display-p3")) {
        setInputFormat("p3");
      } else if (input.startsWith("vec")) {
        setInputFormat("vec");
      } else {
        setInputFormat("rgb");
      }
    } else {
      setConvertedColors([{ format: "Invalid color input" as ColorFormat, value: "", hexValue: "#808080" }]);
    }
  };

  return (
    <List
      onSearchTextChange={(text) => {
        setInputColor(text);
        if (text) {
          handleColorConversion(text);
        } else {
          setConvertedColors([]);
        }
      }}
      searchBarPlaceholder="Enter a color (e.g., #ffffff, rgb(255, 255, 255), hsl(0deg 0% 100%), etc.)"
    >
      {convertedColors.map(({ format, value, hexValue }, index) => {
        const icon = ColorPreviewIcon({ hexValue });
        return (
          <List.Item
            key={index}
            icon={icon}
            title={
              format === "rgb" ? "RGB" :
              format === "hex" ? "HEX" :
              format === "hsl" ? "HSL" :
              format === "p3" ? "CSS P3" :
              format === "oklch" ? "OKLCH" :
              format === "oklab" ? "OKLAB" :
              format === "vec" ? "VEC" :
              format === "figma" ? "FIGMA" :
              format // This fallback should resolve the TypeScript error
            }
            subtitle={value}
            accessories={[
              {
                icon: format === inputFormat ? Icon.CheckCircle : undefined,
                tooltip: format === inputFormat ? "Input format" : undefined,
              },
            ]}
            actions={
              <ActionPanel>
                <Action.CopyToClipboard content={value} />
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}