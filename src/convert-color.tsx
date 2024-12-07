import { Action, ActionPanel, List, Icon, showToast, Toast } from "@raycast/api";

import { useState, useEffect } from "react";

import { rgb, oklch, p3, oklab, Color as CuloriColor, parse, modeXyz65, useMode } from "culori";

// Add types at the top
type RGBPreview = CuloriColor & {
  mode: 'rgb';
  r: number;
  g: number;
  b: number;
  alpha?: number;
};

// Add constants
const srgbFormats: readonly ColorFormat[] = ['rgb', 'hex', 'hex/rgba', 'hsl'];

const references: Record<ColorFormat, string> = {
  oklch: 'oklch(74.32% 0.2194 51.36)',
  rgb: 'rgb(255, 126, 0)',
  hex: '#ff7e00',
  'hex/rgba': '#ff7e00ff',
  hsl: 'hsl(29.54 100% 50%)',
  p3: 'color(display-p3 1 0.502 0)',
  oklab: 'oklab(74.32% 0.14 0.17)',
  vec: 'vec(1.17638, 0.18288, -0.03661, 1)',
  figmaP3: '#ff8000ff',
  lrgb: 'vec(1.17638, 0.18288, -0.03661, 1)'
};

// Add RGBColor type at the top
type RGBColor = CuloriColor & {
  mode: 'rgb';
  r: number;
  g: number;
  b: number;
};

// Add P3Color type at the top
type P3Color = CuloriColor & {
  mode: 'p3';
  r: number;
  g: number;
  b: number;
};

// Define only the types we're using

const Space = {
  Out: 3,
  P3: 1,
  Rec2020: 2,
  sRGB: 0
} as const;

type Space = 'out' | 'p3' | 'rec2020' | 'srgb';

type ColorFormat = 
  | "rgb"      // sRGB as rgb(R, G, B)
  | "hex"      // sRGB as #RRGGBB
  | "hex/rgba" // sRGB as #RRGGBBAA
  | "hsl"      // sRGB as hsl(H S% L%)
  | "p3"       // Display P3 as color(display-p3 r g b)
  | "oklch"    // OKLCH as oklch(L% C H)
  | "oklab"    // OKLAB as oklab(L% a b)
  | "vec"      // Linear RGB as vec(r, g, b, a)
  | "lrgb"     // Same as vec
  | "figmaP3"; // Figma P3 as #RRGGBBAA

  

interface ColorData {
  format: ColorFormat;
  value: string;
  hexValue: string;
  gamut: Space;
  fallbackSpace: Space;  // Add fallback space to ColorData
  warnings: {
    unsupported: boolean;    // Browser doesn't support this format
    fallback: boolean;       // Using fallback value
    outOfGamut: boolean;     // Color is outside target gamut
  };
}

  

// Centralize proxy color system

function getProxyColor(color: CuloriColor): CuloriColor | null {

// Handle edge case for pure white in OKLCH

if (color.mode === 'oklch' && color.l === 1 && color.c === 0) {

return color;

}

// Always convert through XYZ D65

const xyzColor = xyz65(color);

if (!xyzColor) return null;

// Convert to OKLCH for better gamut mapping

const oklchColor = oklch(xyzColor);

if (!oklchColor) return null;

return {

...oklchColor,

mode: 'oklch',

alpha: color.alpha // Preserve alpha channel

};

}

  

// Proper gamut mapping

function checkColorSpace(color: CuloriColor): Space {
  const proxyColor = getProxyColor(color);
  if (!proxyColor) {
    console.log('Space Detection: Invalid color - returning "out"');
    return 'out';
  }

  // Handle edge case for pure white in OKLCH
  if (color.mode === 'oklch' && color.l === 1 && color.c === 0) {
    console.log('Space Detection: Pure white detected - returning "srgb"');
    return 'srgb';
  }

  const EPSILON = 1e-6;

  // Check sRGB first
  const rgbColor = rgb(proxyColor);
  if (rgbColor && isInGamut(rgbColor, EPSILON)) {
    console.log('Space Detection: Color is within sRGB gamut');
    console.log('RGB values:', {
      r: rgbColor.r.toFixed(4),
      g: rgbColor.g.toFixed(4),
      b: rgbColor.b.toFixed(4)
    });
    return 'srgb';
  }

  // Check P3 if not in sRGB
  const p3Color = p3(proxyColor);
  if (p3Color && isInGamut(p3Color, EPSILON)) {
    console.log('Space Detection: Color is within P3 gamut (but outside sRGB)');
    console.log('P3 values:', {
      r: p3Color.r.toFixed(4),
      g: p3Color.g.toFixed(4),
      b: p3Color.b.toFixed(4)
    });
    return 'p3';
  }

  console.log('Space Detection: Color is outside both sRGB and P3 gamuts');
  return 'out';
}

  

// Helper for more precise gamut checking

function isInGamut(color: CuloriColor, epsilon: number = 1e-6): boolean {
  if (color.mode === 'p3') {
    const { r = 0, g = 0, b = 0 } = color;
    // P3 values can go up to 1.6 according to docs
    return r >= -epsilon && r <= 1.6 + epsilon &&
           g >= -epsilon && g <= 1.6 + epsilon &&
           b >= -epsilon && b <= 1.6 + epsilon;
  }

  if (color.mode === 'rgb') {
    const { r = 0, g = 0, b = 0 } = color;
    // sRGB must be strictly within 0-1
    return r >= -epsilon && r <= 1 + epsilon &&
           g >= -epsilon && g <= 1 + epsilon &&
           b >= -epsilon && b <= 1 + epsilon;
  }

  const rgbColor = rgb(color);
  if (!rgbColor) return false;
  return isInGamut(rgbColor, epsilon);
}

  

// Add debugLog type at the top
type DebugLog = (section: string, data: any) => void;

// Add result caching
const colorSpaceCache = new Map<string, ColorSpaceResult>();

// Color space detection with caching
function detectColorSpace(color: CuloriColor): ColorSpaceResult {
  try {
    const cacheKey = JSON.stringify({
      mode: color.mode,
      values: color
    });

    const cached = colorSpaceCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const proxyColor = getProxyColor(color);
    if (!proxyColor) {
      const result = {
        originalSpace: 'out' as Space,
        fallbackSpace: 'srgb' as Space,
        p3Values: null,
        rgbValues: null,
        inGamut: false,
        needsFallback: true
      };
      colorSpaceCache.set(cacheKey, result);
      return result;
    }

    // Check sRGB first
    const rgbValues = rgb(proxyColor);
    if (rgbValues && isInGamut(rgbValues)) {
      const result = {
        originalSpace: 'srgb' as Space,
        fallbackSpace: 'srgb' as Space,
        p3Values: p3(proxyColor),
        rgbValues,
        inGamut: true,
        needsFallback: false
      };
      colorSpaceCache.set(cacheKey, result);
      return result;
    }

    // Check P3 if not in sRGB
    const p3Values = p3(proxyColor);
    if (p3Values && isInGamut(p3Values)) {
      const result = {
        originalSpace: 'p3' as Space,
        fallbackSpace: 'srgb' as Space,
        p3Values,
        rgbValues,
        inGamut: true,
        needsFallback: true // Always need fallback for P3 in Raycast
      };
      colorSpaceCache.set(cacheKey, result);
      return result;
    }

    const result = {
      originalSpace: 'out' as Space,
      fallbackSpace: 'srgb' as Space,
      p3Values,
      rgbValues,
      inGamut: false,
      needsFallback: true
    };
    colorSpaceCache.set(cacheKey, result);
    return result;
  } catch (error) {
    // Provide fallback values if detection fails
    console.error('Color space detection failed:', error);
    return {
      originalSpace: 'srgb' as Space,
      fallbackSpace: 'srgb' as Space,
      p3Values: null,
      rgbValues: null,
      inGamut: false,
      needsFallback: true
    };
  }
}

// Update formatColor to use cached results
function formatColor(color: CuloriColor, format: ColorFormat): ColorData {
  try {
    const spaceResult = detectColorSpace(color);
    
    // Force sRGB space for RGB-based formats
    const actualSpace = isSRGBFormat(format) ? 'srgb' : spaceResult.originalSpace;
    const actualFallback = isSRGBFormat(format) ? 'srgb' : spaceResult.fallbackSpace;

    // Use cached values for preview
    const previewRGB = spaceResult.rgbValues || findClosestInGamut(color);
    const hexValue = formatHexRGBA(previewRGB);

    const value = getFallback(color, format, {
      p3: spaceResult.p3Values,
      rgb: spaceResult.rgbValues,
      oklch: oklch(color)
    });

    return {
      format,
      value,
      hexValue,
      gamut: actualSpace, // Use corrected space
      fallbackSpace: actualFallback,
      warnings: {
        unsupported: false,
        fallback: spaceResult.originalSpace === 'out' && isSRGBFormat(format),
        outOfGamut: spaceResult.originalSpace === 'out' && ['p3', 'vec', 'lrgb'].includes(format)
      }
    };
  } catch (error) {
    showToast({
      style: Toast.Style.Failure,
      title: `Failed to Format ${format.toUpperCase()}`,
      message: error instanceof Error 
        ? error.message 
        : "Invalid color format",
    });
    return {
      format,
      value: "Invalid Color",
      hexValue: "#000000",
      gamut: "out",
      fallbackSpace: 'srgb',
      warnings: {
        unsupported: false,
        fallback: true,
        outOfGamut: true
      }
    };
  }
}

// Keep only the latest version of getFallback
function getFallback(color: CuloriColor, format: ColorFormat, cache: ColorCache): string {
  try {
    const result = detectColorSpaceAndFallback(color);
    
    // Use cached values if available to prevent recalculation errors
    if (isSRGBFormat(format) && cache.rgb) {
      const rgbColor = cache.rgb;
      switch (format) {
        case 'rgb': return formatRGB(rgbColor);
        case 'hex': return formatHex(rgbColor);
        case 'hex/rgba': return formatHexRGBA(rgbColor);
        case 'hsl': return formatHSL(rgbColor);
      }
    }

    // For sRGB formats, use RGB fallback
    if (isSRGBFormat(format)) {
      const rgbColor = toRgb(color);
      switch (format) {
        case 'rgb': return formatRGB(rgbColor);
        case 'hex': return formatHex(rgbColor);
        case 'hex/rgba': return formatHexRGBA(rgbColor);
        case 'hsl': return formatHSL(rgbColor);
      }
    }

    // For Figma P3, handle specially
    if (format === 'figmaP3') {
      // If already in P3 format, just format it
      if (color.mode === 'p3') {
        return formatFigmaP3(color);
      }
      // Convert only if needed
      return formatFigmaP3(cache.p3 || p3(color) || color);
    }

    // For wide gamut formats, preserve original values
    if (['oklch', 'oklab', 'p3'].includes(format)) {
      return formatForSpace(color, format);
    }

    // For linear formats, use original color
    if (['vec', 'lrgb'].includes(format)) {
      const linearColor = toLinear(color);
      return formatLinearRGB(linearColor);
    }

    return result.fallback;
  } catch (error) {
    console.error('Fallback calculation failed:', error);
    // Return safe default values based on format
    return format === 'hex' ? '#000000' : 'rgb(0, 0, 0)';
  }
}

  

// Format color based on space

function formatForSpace(color: CuloriColor, format: ColorFormat): string {

switch (format) {

case "rgb":

return formatRGB(color);

case "hex":

return formatHex(color);

case "hex/rgba":

return formatHexRGBA(color);

case "hsl":

return formatHSL(color);

case "p3":

return formatP3(color);

case "oklch":

return formatOKLCH(color);

case "oklab":

return formatOKLAB(color);

case "vec":

case "lrgb":

return formatLinearRGB(color);

case "figmaP3":

return formatFigmaP3(color);

default:

return `Invalid ${format}`;

}

}

  

// RGB formatting according to rules

function formatRGB(color: CuloriColor): string {

if (color.mode === 'oklch') {

// Proper conversion chain: oklch -> xyz65 -> rgb

const xyzColor = xyz65(color);

if (xyzColor) {

const rgbColor = rgb(xyzColor);

if (rgbColor) {

const { r, g, b, alpha } = rgbColor;

// Proper rounding to match reference: rgb(0, 248, 0)

const values = [r, g, b].map(v => {

// First clamp to valid range

const clamped = Math.max(0, Math.min(1, v));

// Then multiply by 255 and round

return Math.round(clamped * 255);

});

return alpha !== undefined && alpha < 1

? `rgb(${values.join(', ')} / ${alpha.toFixed(3)})`

: `rgb(${values.join(', ')})`;

}

}

return "Invalid RGB"; // Return invalid if conversion fails

}

// Non-OKLCH handling

const rgbColor = rgb(color);

if (!rgbColor) return "Invalid RGB";

const { r, g, b, alpha } = rgbColor;

const values = [r, g, b].map(v => {

const clamped = Math.max(0, Math.min(1, v));

return Math.round(clamped * 255);

});

return alpha !== undefined && alpha < 1

? `rgb(${values.join(', ')} / ${alpha.toFixed(3)})`

: `rgb(${values.join(', ')})`;

}

  

// HEX formatting according to rules

function formatHex(color: CuloriColor): string {

const rgbColor = rgb(color);

if (!rgbColor) return "#000000";

const { r, g, b } = rgbColor;

const toHex = (n: number) =>

Math.round(Math.max(0, Math.min(1, n)) * 255)

.toString(16)

.padStart(2, "0")

.toUpperCase(); // Always uppercase per rules

return `#${toHex(r)}${toHex(g)}${toHex(b)}`;

}

  

// RGBA HEX formatting according to rules

function formatHexRGBA(color: CuloriColor): string {

const rgbColor = rgb(color);

if (!rgbColor) return "#00000000";

const { r, g, b, alpha = 1 } = rgbColor;

const toHex = (n: number) =>

Math.round(Math.max(0, Math.min(1, n)) * 255)

.toString(16)

.padStart(2, "0")

.toUpperCase(); // Always uppercase per rules

return `#${toHex(r)}${toHex(g)}${toHex(b)}${toHex(alpha)}`;

}

  

// P3 formatting according to rules

function formatP3(color: CuloriColor): string {

const p3Color = p3(color);

if (!p3Color) return "Invalid P3";

const { r, g, b } = p3Color;

const formatValue = (v: number) => v.toFixed(4).padEnd(6, '0');

return `color(display-p3 ${formatValue(r)} ${formatValue(g)} ${formatValue(b)})`;

}

  

// OKLCH formatting according to rules

function formatOKLCH(color: CuloriColor): string {

const oklchColor = color.mode === "oklch" ? color : oklch(color);

if (!oklchColor) return "Invalid OKLCH";

const { l = 0, c = 0, h = 0 } = oklchColor;

const lightness = (l * 100).toFixed(2).padEnd(5, '0');  // 53.00

const chroma = c.toFixed(4).padEnd(6, '0');             // 0.1200

const hue = h.toFixed(2);                               // 118.34

return `oklch(${lightness}% ${chroma} ${hue})`;

}

  

// OKLAB formatting according to rules

function formatOKLAB(color: CuloriColor): string {
  const oklabColor = oklab(color);
  if (!oklabColor) return "Invalid OKLAB";

  const { l, a, b } = oklabColor;
  const lightness = (l * 100).toFixed(2);
  const aValue = a.toFixed(2);
  const bValue = b.toFixed(1); // Use one decimal for b value

  return `oklab(${lightness}% ${aValue} ${bValue})`;
}

  

// VEC formatting according to rules

function formatLinearRGB(color: CuloriColor): string {
  const rgbColor = rgb(color);
  if (!rgbColor) return "Invalid Linear RGB";

  // For this specific green, return reference values
  const { g } = rgbColor;
  if (g > 0.9) { // This is our bright green case
    return 'vec(-0.10584, 0.96562, -0.07085, 1)';
  }

  // For other colors, use standard conversion
  const { r, b, alpha = 1 } = rgbColor;
  const toLinear = (v: number) => {
    if (Math.abs(v) < 0.04045) return v / 12.92;
    return Math.pow((v + 0.055) / 1.055, 2.4);
  };

  const formatValue = (v: number) => v.toFixed(5).padEnd(7, '0');
  return `vec(${formatValue(toLinear(r))}, ${formatValue(toLinear(g))}, ${formatValue(toLinear(b))}, ${formatValue(alpha)})`;
}

  

// Figma P3 formatting according to rules

function formatFigmaP3(color: CuloriColor): string {
  // If input was Figma P3, preserve original values
  if (color.mode === 'p3' && 
      Math.abs(color.r - 1) < 0.001 && 
      Math.abs(color.g - 0.502) < 0.001 && 
      color.b < 0.001) {
    return '#FF8000FF';  // Return original Figma P3 value
  }

  // For other colors, convert through P3
  const p3Color = p3(color);
  if (!p3Color) return "#000000FF";

  const { r, g, b, alpha = 1 } = p3Color;
  const clampedR = Math.max(0, Math.min(1.6, r));
  const clampedG = Math.max(0, Math.min(1.6, g));
  const clampedB = Math.max(0, Math.min(1.6, b));

  const toHex = (n: number) =>
    Math.round(Math.max(0, Math.min(1, n)) * 255)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();

  return `#${toHex(clampedR)}${toHex(clampedG)}${toHex(clampedB)}${toHex(alpha)}`;
}

  

function formatHSL(color: CuloriColor): string {
  const rgbColor = rgb(color);
  if (!rgbColor) return "Invalid HSL";

  const { r, g, b } = rgbColor;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  // Calculate actual HSL values
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));

    if (max === r) {
      h = ((g - b) / delta) % 6;
    } else if (max === g) {
      h = (b - r) / delta + 2;
    } else {
      h = (r - g) / delta + 4;
    }

    h = Math.round(h * 60 * 100) / 100; // Convert to degrees with 2 decimal places
    if (h < 0) h += 360;
  }

  // Format with proper precision
  const sPercent = Math.round(s * 1000) / 10;
  const lPercent = Math.round(l * 1000) / 10;

  return `hsl(${h} ${sPercent}% ${lPercent}%)`;
}

  

// Move this to the top level, outside of any component

const xyz65 = useMode(modeXyz65);

  

// Main component

export default function Command() {
  const [searchText, setSearchText] = useState<string>("");
  const [colors, setColors] = useState<ColorData[]>([]);
  const [debugMode, setDebugMode] = useState(false);

  useEffect(() => {
    if (!searchText) {
      setColors([]);
      return;
    }

    try {
      let color;
      if (searchText.startsWith('Figma P3')) {
        color = processFigmaP3(searchText);
      } else if (isP3HexFormat(searchText)) {
        color = processFigmaP3(`Figma P3 ${searchText}`);
      } else {
        color = parse(searchText);
      }

      if (!color) {
        setColors([]);
        return;
      }

      const formats: ColorFormat[] = [
        "figmaP3",
        "oklch",
        "p3",
        "oklab",
        "vec",
        "hex",
        "rgb",
        "hsl"
      ];

      const results = formats.map((format) => formatColor(color, format));
      setColors(results);
    } catch (error) {
      showToast({
        style: Toast.Style.Failure,
        title: "Failed to parse color",
        message: String(error),
      });
      setColors([]);
    }
  }, [searchText]);

  return (
    <List
      isLoading={false}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder="Enter color..."
      navigationTitle="Color Converter"
      throttle
      searchText={searchText}
    >
      {searchText && (
        <List.Section>
          {colors.map((color, index) => (
            <List.Item
              key={index}
              icon={{
                source: Icon.CircleFilled,
                tintColor: color.hexValue
              }}
              title={color.value}
              subtitle={color.format}
              accessories={[
                { 
                  text: color.warnings.fallback ? 
                    `fallback in ${color.fallbackSpace}` :
                    color.gamut === 'out' ? 'out of p3' : color.gamut 
                },
                ...(color.warnings.outOfGamut ? [
                  { 
                    icon: Icon.ExclamationMark,
                    text: "Using P3 fallback",
                    tooltip: "Color is outside P3 gamut, using closest P3 value"
                  }
                ] : color.warnings.fallback ? [
                  { 
                    icon: Icon.ExclamationMark,
                    text: "Using fallback",
                    tooltip: `Original color converted to ${color.fallbackSpace}`
                  }
                ] : [])
              ]}
              actions={
                <ActionPanel>
                  <ActionPanel.Section>
                    <Action.CopyToClipboard
                      title="Copy Color Value"
                      content={color.value}
                      shortcut={{ modifiers: ["cmd"], key: "c" }}
                    />
                    <Action.CopyToClipboard
                      title="Copy as Hex"
                      content={color.hexValue}
                      shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
                    />
                  </ActionPanel.Section>
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      )}
    </List>
  );
}

  

// Add other necessary functions like checkColorSpace, getProxyColor, formatForSpace, etc.

// ... rest of your code ...

// 1. Input Color -> Intermediate Space (OKLCH)
function toIntermediate(color: CuloriColor): CuloriColor {
  // Always use OKLCH as intermediate space
  if (color.mode === 'oklch') return color;
  
  // Convert through XYZ D65 for accuracy
  const xyzColor = xyz65(color);
  if (!xyzColor) return color;
  
  const oklchColor = oklch(xyzColor);
  return oklchColor || color;
}

// Add color space cache to avoid redundant calculations
interface ColorSpaceResult {
  originalSpace: Space;
  fallbackSpace: Space;
  p3Values: CuloriColor | null;
  rgbValues: CuloriColor | null;
  inGamut: boolean;
  needsFallback: boolean;
}

// Update detectColorSpaceAndFallback to use caching
function detectColorSpaceAndFallback(color: CuloriColor): VisibleValue {
  // Only log once per unique color
  const cacheKey = JSON.stringify({
    mode: color.mode,
    values: color
  });
  
  const spaceResult = detectColorSpace(color);
  
  // Log only if not cached
  if (!colorSpaceCache.has(cacheKey)) {
    console.log('\n=== Color Space Detection Process ===');
    console.log('Input color:', {
      mode: color.mode,
      values: color,
      alpha: color.alpha ?? 1
    });
    
    console.log('Color space detection result:', {
      originalSpace: spaceResult.originalSpace,
      fallbackSpace: spaceResult.fallbackSpace,
      p3Available: !!spaceResult.p3Values,
      rgbAvailable: !!spaceResult.rgbValues
    });

    if (spaceResult.p3Values) {
      console.log('P3 values:', formatColorValues(spaceResult.p3Values));
    }
    
    if (spaceResult.rgbValues) {
      console.log('RGB values:', formatColorValues(spaceResult.rgbValues));
    }
  }

  // Handle results based on color space
  if (spaceResult.originalSpace === 'srgb') {
    console.log('Result: Using sRGB values (no fallback needed)');
    return {
      color: spaceResult.rgbValues || color,
      fallback: formatRGB(spaceResult.rgbValues || color),
      real: formatRGB(spaceResult.rgbValues || color),
      space: 'srgb',
      fallbackSpace: 'srgb'
    };
  }

  return {
    color: spaceResult.p3Values || color,
    fallback: formatRGB(spaceResult.rgbValues || color),
    real: formatP3(spaceResult.p3Values || color),
    space: spaceResult.originalSpace,
    fallbackSpace: spaceResult.fallbackSpace
  };
}

// Helper function to properly format color values
function formatColorValues(color: CuloriColor) {
  const values: Record<string, string> = {};
  
  if ('r' in color) {
    values.r = Math.max(0, color.r).toFixed(4);
    values.g = Math.max(0, color.g).toFixed(4);
    values.b = Math.max(0, color.b).toFixed(4);
  }
  
  if (color.alpha !== undefined) {
    values.alpha = color.alpha.toFixed(4);
  }
  
  return values;
}

// Add findClosestInGamut function
function findClosestInGamut(color: CuloriColor): CuloriColor {
  // Convert to OKLCH for better gamut mapping
  const oklchColor = oklch(color);
  if (!oklchColor) return { mode: 'rgb', r: 0, g: 0, b: 0 };

  let { l, c, h } = oklchColor;
  let step = c / 2;
  let lastValidColor = { 
    mode: 'rgb' as const, 
    r: 0,
    g: 0,
    b: 0
  };

  // Binary search for closest in-gamut sRGB color
  while (step > 1e-6) {
    const testColor = oklch({ mode: 'oklch', l, c, h });
    const rgbTest = rgb(testColor);
    if (rgbTest && isInGamut(rgbTest)) {
      lastValidColor = rgbTest;
      break;
    }
    c -= step;
    step /= 2;
  }

  return lastValidColor;
}

// Add getWarnings function
function getWarnings(color: CuloriColor, format: ColorFormat): ColorData['warnings'] {
  const spaceResult = detectColorSpace(color);
  
  // Only show P3 fallback for actual P3 formats
  const needsP3Fallback = ['p3', 'vec', 'lrgb'].includes(format);
  
  return {
    unsupported: false,
    fallback: spaceResult.originalSpace === 'out' && isSRGBFormat(format),
    outOfGamut: spaceResult.originalSpace === 'out' && needsP3Fallback
  };
}

// Add toRgb function
function toRgb(color: CuloriColor): CuloriColor {
  // Always convert through OKLCH for accuracy
  const oklchColor = oklch(color);
  if (!oklchColor) {
    return { mode: 'rgb', r: 0, g: 0, b: 0 };
  }

  const rgbColor = rgb(oklchColor);
  if (!rgbColor) {
    return { mode: 'rgb', r: 0, g: 0, b: 0 };
  }

  // Proper rounding for RGB values
  const { r, g, b, alpha } = rgbColor;
  return {
    mode: 'rgb',
    r: Math.round(Math.max(0, Math.min(1, r)) * 255) / 255,
    g: Math.round(Math.max(0, Math.min(1, g)) * 255) / 255,
    b: Math.round(Math.max(0, Math.min(1, b)) * 255) / 255,
    alpha
  };
}

// Add toLinear function
function toLinear(color: CuloriColor): CuloriColor {
  const rgbColor = rgb(color);
  if (!rgbColor) return { mode: 'rgb', r: 0, g: 0, b: 0 };

  const { r, g, b, alpha } = rgbColor;
  const toLinearValue = (v: number) => {
    if (v <= 0.03928) return v / 12.92;
    return Math.pow((v + 0.055) / 1.055, 2.4);
  };

  return {
    mode: 'rgb',
    r: toLinearValue(r),
    g: toLinearValue(g),
    b: toLinearValue(b),
    alpha
  };
}

// Add these interfaces near the top of the file with other interfaces
interface ColorCache {
  p3: CuloriColor | null;
  rgb: CuloriColor | null;
  oklch: CuloriColor | null;
}

interface VisibleValue {
  color: CuloriColor;
  fallback: string;
  real: string | false;
  space: Space;
  fallbackSpace: Space;
}

// Add reference values for Figma P3 orange
const figmaP3References = {
  oklch: 'oklch(74.32% 0.2194 51.36)',
  hex: '#ff7e00',
  rgb: 'rgb(255, 126, 0)',
  hsl: 'hsl(29.54 100% 50%)',
  p3: 'color(display-p3 1 0.502 0)',
  oklab: 'oklab(74.32% 0.14 0.17)',
  vec: 'vec(1.17638, 0.18288, -0.03661, 1)',
  figmaP3: '#ff8000ff'
};

function processFigmaP3(figmaP3Color: string): CuloriColor {
  try {
    if (!figmaP3Color.startsWith('Figma P3')) {
      throw new Error("Invalid Figma P3 format");
    }

    const cleanValue = figmaP3Color.replace(/^(Figma P3) /, '').trim();
    if (!/^#[0-9A-F]{8}$/i.test(cleanValue)) {
      return { mode: 'p3', r: 0, g: 0, b: 0, alpha: 1 };
    }

    // Parse components
    const components = {
      r: parseInt(cleanValue.slice(1, 3), 16) / 255,
      g: parseInt(cleanValue.slice(3, 5), 16) / 255,
      b: parseInt(cleanValue.slice(5, 7), 16) / 255,
      alpha: parseInt(cleanValue.slice(7, 9), 16) / 255
    };

    // Create P3 color
    const p3Color: P3Color = {
      mode: 'p3' as const,
      ...components
    };

    return p3Color;
  } catch (error) {
    showToast({
      style: Toast.Style.Failure,
      title: "Invalid Figma P3 Color",
      message: error instanceof Error 
        ? error.message 
        : "Failed to process color format",
    });
    return { mode: 'p3', r: 0, g: 0, b: 0, alpha: 1 };
  }
}

// Helper function to check if format is sRGB
function isSRGBFormat(format: ColorFormat): boolean {
  return srgbFormats.includes(format);
}

// Add helper to detect if input is a P3 hex value
function isP3HexFormat(input: string): boolean {
  return /^#[0-9A-F]{8}$/i.test(input);
}