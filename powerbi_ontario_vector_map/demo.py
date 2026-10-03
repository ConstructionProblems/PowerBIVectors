"""Run a standalone demo of the offline Ontario vector map."""

from pathlib import Path

import matplotlib.pyplot as plt
import pandas as pd

from map_renderer import render_ontario_map


SAMPLE_DATA_PATH = Path(__file__).resolve().parent / "data" / "sample_transmission_lines.csv"


def build_sample_lines() -> pd.DataFrame:
    """Load fictional demo lines for testing outside Power BI."""

    return pd.read_csv(SAMPLE_DATA_PATH, dtype={"ProjectNumber": "string"})


if __name__ == "__main__":
    sample_lines = build_sample_lines()
    fig, ax = render_ontario_map(sample_lines)
    ax.set_title("Ontario Transmission Lines Demo", fontsize=12, pad=8)
    plt.show()
