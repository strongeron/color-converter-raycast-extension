# Color Converter All

This Raycast extension converts colors between various formats including Figma hex, OKLCH, and more.

## Setup Instructions

1. Ensure you have [Node.js](https://nodejs.org/) installed on your machine.

2. Clone this repository or unzip the extension files to a directory of your choice.

3. Open Terminal and navigate to the extension directory:
   ```
   cd path/to/color-converter-all
   ```

4. Install the dependencies:
   ```
   npm install
   ```

5. Start the development server:
   ```
   npm run dev
   ```

6. Raycast should automatically detect the extension. If it doesn't, you may need to manually import it:
   - Open Raycast
   - Search for "Import Extension"
   - Select the directory where you cloned/unzipped this extension

## Usage

1. Open Raycast (usually with ⌘+Space)
2. Type "Convert Color" to find the extension
3. Press Enter to run the extension
4. Enter a color value in any supported format
5. The extension will display the color in various formats

## Supported Color Formats

- RGB
- HEX
- HSL
- P3
- OKLCH
- OKLAB
- VEC (Linear RGB)
- Figma P3

## Development

To make changes to the extension:

1. Ensure the development server is running (`npm run dev`)
2. Edit the files in the `src` directory
3. Changes will be automatically reflected in Raycast

## Building for Production

To create a production build:
