# NAS Photo Gallery

A simple photo gallery application for browsing images stored on a NAS, built with Nuxt 3.

This application allows you to mount a directory of images and browse them through a web interface. It features on-demand thumbnail generation, basic authentication, and a clean, responsive UI.

## Features

-   Web-based image browsing
-   On-demand thumbnail generation for fast loading
-   Responsive grid layout
-   Lightbox view for full-size images
-   Basic authentication to protect your gallery
-   Differential scanning to efficiently update the image database

## Setup and Installation

### 1. Prerequisites

-   [Node.js](https://nodejs.org/) (v18 or later recommended)
-   An image directory accessible from the machine running the application (e.g., a mounted NAS share).

### 2. Clone the Repository

```bash
git clone <your-repository-url>
cd nas-gallery
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Configure Environment Variables

Create a `.env` file in the root of the project by copying the example file:

```bash
cp .env.example .env
```

Now, edit the `.env` file with your specific settings:

```
# Path to the root directory of your images (e.g., a NAS mount point)
IMAGE_ROOT=/path/to/your/nas/photos

# Basic authentication credentials
BASIC_AUTH_USER=admin
BASIC_AUTH_PASS=your-secret-password

# (Optional) Port for the application
NUXT_PORT=3000

# (Optional) Thumbnail width in pixels
NUXT_PUBLIC_THUMBNAIL_WIDTH=400
```

**Important:**
-   `IMAGE_ROOT` must be an **absolute path** to the directory containing your images.
-   Change `BASIC_AUTH_PASS` to a strong, unique password.

### 5. Scan Your Image Directory

Before starting the application for the first time, you need to scan your image directory to populate the database. This command is idempotent and can be run safely multiple times.

```bash
npm run scan
```

This script will:
-   Find all `.jpg`, `.jpeg`, `.png`, and `.gif` files in your `IMAGE_ROOT`.
-   Register them in a local SQLite database (`data/meta.db`).
-   Mark files that were previously registered but are no longer found as "deleted".
-   If an image file has been updated (based on size or modification time), it will clear the old thumbnail cache, ensuring a fresh thumbnail is generated on the next request.

Run this script whenever you add, remove, or update images in your directory.

### 6. Start the Application

```bash
npm run dev
```

The application will be available at `http://localhost:3000` (or the port you specified). You will be prompted for the username and password you set in the `.env` file.

## Usage

-   **Browse:** Scroll through the gallery. Images are loaded in pages.
-   **View Full-Size:** Click on any thumbnail to open the full-size image in a lightbox overlay. You can navigate between images within the lightbox.
-   **Update Library:** After adding or removing photos from your `IMAGE_ROOT` directory, stop the application, run `npm run scan` again, and then restart the application.

## Project Structure

-   `server/`: Nuxt server directory.
    -   `api/`: API endpoints for images, thumbnails, etc.
    -   `middleware/`: Basic authentication middleware.
    -   `utils/`: Database utilities (`db.ts`).
-   `pages/`: Vue components for pages.
-   `scripts/`: Node.js scripts, including the `scan-and-thumb.mjs` scanner.
-   `data/`: Contains the SQLite database (`meta.db`). This is ignored by Git.
-   `.cache/`: Stores generated thumbnails. This is ignored by Git.
-   `nuxt.config.ts`: Nuxt configuration file.
-   `.env`: Your local environment configuration (ignored by Git).
-   `.env.example`: An example environment file.

## Security Considerations

-   Keep your `.env` file secret. It contains sensitive information like your database path and authentication credentials.
-   Consider using a stronger authentication mechanism (like OAuth) and serving your application over HTTPS in a production environment.

## Troubleshooting Common Issues

| Symptom               | Solution                                                            |
| --------------------- | ------------------------------------------------------------------- |
| Images not showing    | Check the `IMAGE_ROOT` path and permissions. Ensure the NAS is mounted. |
| Thumbnail generation  | Rebuild sharp dependencies: `npm rebuild sharp`                     |
| Authentication issues | Clear browser cache or try a different browser.                     |
| Cannot push to repo   | Check SSH key settings and verify remote URL with `git remote -v`.  |

## Roadmap (Partial)

-   Implement bcrypt + session-based authentication
-   Add EXIF data reading (exifr)
-   Implement PATCH API for tags (add/remove differential updates)
-   Add thumbnail retry queue
-   Implement physical delete garbage collector

## License

For learning purposes (unspecified: add as needed).

---

Feedback / Issues: Please use GitHub Issues. PRs are welcome.
