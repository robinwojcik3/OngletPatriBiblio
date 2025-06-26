import json
import os
import tempfile
import zipfile
import io
import base64
from shapely.geometry import Point, mapping
import fiona
from pyproj import CRS, Transformer

def handler(event, context):
    try:
        body = json.loads(event['body'])
        occurrences = body.get('occurrences', [])

        if not occurrences:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'No occurrences data provided.'})
            }

        # Define the schema for the shapefile
        schema = {
            'geometry': 'Point',
            'properties': {
                'species': 'str',
                'color': 'str',
                'latitude': 'float',
                'longitude': 'float'
            },
        }

        # Define the coordinate reference systems
        # WGS84 (input from GBIF)
        crs_wgs84 = CRS("EPSG:4326")
        # Lambert 93 (output)
        crs_lambert93 = CRS("EPSG:2154")

        # Create a transformer for WGS84 to Lambert 93
        transformer = Transformer.from_crs(crs_wgs84, crs_lambert93, always_xy=True)

        # Create a temporary directory for shapefile components
        with tempfile.TemporaryDirectory() as tmpdir:
            shapefile_path = os.path.join(tmpdir, 'patrimonial_species.shp')

            with fiona.open(
                shapefile_path,
                'w',
                driver='ESRI Shapefile',
                crs=crs_lambert93,  # Set the CRS for the output shapefile
                schema=schema
            ) as collection:
                for occ in occurrences:
                    lat = occ.get('decimalLatitude')
                    lon = occ.get('decimalLongitude')
                    species_name = occ.get('speciesName', 'N/A')
                    color = occ.get('color', 'N/A')

                    if lat is not None and lon is not None:
                        # Transform coordinates
                        lon_lambert, lat_lambert = transformer.transform(lon, lat)
                        point = Point(lon_lambert, lat_lambert)
                        collection.write({
                            'geometry': mapping(point),
                            'properties': {
                                'species': species_name,
                                'color': color,
                                'latitude': lat,
                                'longitude': lon
                            }
                        })

            # Zip the shapefile components
            zip_buffer = io.BytesIO()
            with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
                for filename in os.listdir(tmpdir):
                    zf.write(os.path.join(tmpdir, filename), filename)

            zip_buffer.seek(0)

            return {
                'statusCode': 200,
                'headers': {
                    'Content-Type': 'application/zip',
                    'Content-Disposition': 'attachment; filename="patrimonial_species.zip"'
                },
                'body': base64.b64encode(zip_buffer.read()).decode('utf-8'),
                'isBase64Encoded': True
            }

    except Exception as e:
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }