"""Paste this script into a Power BI Python visual."""

import sys

import matplotlib.pyplot as plt


PACKAGE_PATH = r"C:\PATH\TO\powerbi_ontario_vector_map"

if PACKAGE_PATH not in sys.path:
    sys.path.insert(0, PACKAGE_PATH)

from map_renderer import render_ontario_map


# Power BI Python visuals are rendered as static images. To "pan" or "zoom",
# edit these values or pass matching slicer/parameter columns in the dataset:
# MapCenterLongitude, MapCenterLatitude, and MapZoom.
VIEW_CENTER_LONGITUDE = None
VIEW_CENTER_LATITUDE = None
VIEW_ZOOM = None

fig, ax = render_ontario_map(
    dataset,
    center_lon=VIEW_CENTER_LONGITUDE,
    center_lat=VIEW_CENTER_LATITUDE,
    zoom=VIEW_ZOOM,
)
plt.show()
