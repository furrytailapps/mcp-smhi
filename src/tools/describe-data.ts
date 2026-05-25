import { smhiClient } from '@/clients/smhi-client';
import { withErrorHandling } from '@/lib/response';
import { ValidationError } from '@/lib/errors';
import { listKommuner, listLan, getKommunerInLan } from '@/lib/location-resolver';
import { describeDataTypeSchema } from '@/types/common-schemas';
import { z } from 'zod';

export const describeDataInputSchema = {
  dataType: describeDataTypeSchema,
  lanFilter: z
    .string()
    .optional()
    .describe(
      'For kommuner: filter by län code to list only kommuner in that county. ' + 'Example: "AB" for Stockholms län kommuner.',
    ),
};

export const describeDataTool = {
  name: 'smhi_describe_data',
  description:
    'Discover available SMHI data sources, parameters, stations, and Swedish administrative areas. ' +
    'Use this to find station IDs, understand available parameters, list warning districts, ' +
    'or look up kommun/län codes for location-based queries. ' +
    'Options: forecast_parameters, met_stations, hydro_stations, ocean_stations, met_parameters, hydro_parameters, ' +
    'ocean_parameters, warning_districts, radar_products, kommuner, lan. ' +
    'Example: dataType=kommuner, lanFilter="AB" to list kommuner in Stockholms län.',
  inputSchema: describeDataInputSchema,
};

type DescribeDataInput = {
  dataType: z.infer<typeof describeDataTypeSchema>;
  lanFilter?: string;
};

export const describeDataHandler = withErrorHandling(async (args: DescribeDataInput) => {
  switch (args.dataType) {
    case 'forecast_parameters':
      return {
        description: 'Parameters available in point forecasts',
        parameters: await smhiClient.getForecastParameters(),
      };

    case 'met_stations': {
      const stations = await smhiClient.listStations('meteorological');
      return {
        description: 'Active meteorological observation stations',
        count: stations.length,
        stations: stations.map((s) => ({
          id: s.id,
          name: s.name,
          latitude: s.latitude,
          longitude: s.longitude,
          height: s.height,
        })),
      };
    }

    case 'hydro_stations': {
      const stations = await smhiClient.listStations('hydrological');
      return {
        description: 'Active hydrological observation stations',
        count: stations.length,
        stations: stations.map((s) => ({
          id: s.id,
          name: s.name,
          latitude: s.latitude,
          longitude: s.longitude,
          waterCourse: s.waterCourse,
          riverBasin: s.riverBasin,
        })),
      };
    }

    case 'ocean_stations': {
      const stations = await smhiClient.listStations('oceanographic');
      return {
        description:
          'Active oceanographic stations reporting sea temperature (the broadest ocean network). ' +
          'Wave and current parameters are measured at a sparse subset of offshore buoys — query ' +
          'smhi_get_observations with the specific parameter to find the nearest station for that measurement.',
        count: stations.length,
        stations: stations.map((s) => ({
          id: s.id,
          name: s.name,
          latitude: s.latitude,
          longitude: s.longitude,
        })),
      };
    }

    case 'met_parameters':
      return {
        description: 'Meteorological observation parameters',
        parameters: await smhiClient.getParameters('meteorological'),
      };

    case 'hydro_parameters':
      return {
        description: 'Hydrological observation parameters',
        parameters: await smhiClient.getParameters('hydrological'),
      };

    case 'ocean_parameters':
      return {
        description:
          'Oceanographic observation parameters (SMHI coastal stations and offshore buoys). ' +
          'Wave parameters (height, period, direction) have sparse coverage — 3-7 active buoys, mostly offshore west coast.',
        parameters: await smhiClient.getParameters('oceanographic'),
      };

    case 'warning_districts': {
      const districts = await smhiClient.getWarningDistricts();
      return {
        description: 'Warning districts for filtering alerts',
        count: districts.length,
        districts,
      };
    }

    case 'radar_products': {
      const products = await smhiClient.getRadarProducts();
      return {
        description: 'Available radar products',
        products: products?.map((p) => ({
          key: p.key,
          title: p.title,
          summary: p.summary,
        })),
      };
    }

    case 'kommuner': {
      const kommuner = args.lanFilter ? getKommunerInLan(args.lanFilter) : listKommuner();
      return {
        description: args.lanFilter
          ? `Swedish kommuner (municipalities) in ${args.lanFilter}`
          : 'Swedish kommuner (municipalities). Use lanFilter to narrow by county.',
        count: kommuner.length,
        kommuner: kommuner.map((k) => ({
          code: k.code,
          name: k.name,
        })),
      };
    }

    case 'lan': {
      const lan = listLan();
      return {
        description: 'Swedish län (counties) with centroid coordinates',
        count: lan.length,
        lan: lan.map((l) => ({
          code: l.code,
          name: l.name,
          latitude: l.latitude,
          longitude: l.longitude,
        })),
      };
    }

    default: {
      const _exhaustive: never = args.dataType;
      throw new ValidationError(`Unknown dataType: ${String(_exhaustive)}`);
    }
  }
});
