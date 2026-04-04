# Dataset Layout

This project can work with your crack image dataset without committing 40,000 files into Git.

## Recommended setup

1. Keep the original image folders where they already live.
2. Copy `dataset.config.example.json` to `dataset.config.json`.
3. Point `positiveDir` and `negativeDir` to your real folders.
4. Run `npm run dataset:index` to build a manifest file.
5. Run the API and frontend locally, or run `npm run dataset:run` for batch processing.

## Optional local folders

If you do want a small sample inside the repo, use these folders:

- `datasets/raw/positive`
- `datasets/raw/negative`

Those folders are ignored by Git except for their placeholder files.

## Label mapping

- `Positive` = anomaly detected
- `Negative` = normal image
