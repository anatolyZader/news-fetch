import {
  ResponsiveContainer,
  BarChart,
  LineChart,
  PieChart,
  CartesianGrid,
  Tooltip,
  Legend,
  XAxis,
  YAxis,
} from 'recharts';
import { useTheme } from '@mui/material/styles';

const TICK_FONT_SIZE = 11;
const LEGEND_FONT_SIZE = 11;

function tooltipContentStyle(theme) {
  return {
    fontSize: 12,
    borderRadius: theme.custom.radius.md,
    border: `1px solid ${theme.palette.divider}`,
  };
}

function axisTick(theme) {
  return { fontSize: TICK_FONT_SIZE, fill: theme.palette.text.secondary };
}

/**
 * Vertical bar chart frame: ResponsiveContainer + BarChart with the
 * standard CartesianGrid, axes, Tooltip and (optional) Legend already
 * configured from theme tokens. Pass `<Bar>` children for the series.
 */
export function BarChartFrame({
  data,
  xKey = 'label',
  height = 200,
  margin = { top: 4, right: 8, left: -20, bottom: 4 },
  legend = true,
  yDomain,
  children,
}) {
  const theme = useTheme();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} barSize={18} margin={margin}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme.palette.divider} />
        <XAxis dataKey={xKey} tick={axisTick(theme)} />
        <YAxis tick={axisTick(theme)} allowDecimals={false} domain={yDomain} />
        <Tooltip contentStyle={tooltipContentStyle(theme)} />
        {legend && <Legend wrapperStyle={{ fontSize: LEGEND_FONT_SIZE }} />}
        {children}
      </BarChart>
    </ResponsiveContainer>
  );
}

/**
 * Horizontal bar chart frame for ranked category comparisons.
 * Pass `<Bar>` children for the series.
 */
export function HorizontalBarChartFrame({
  data,
  yKey = 'name',
  height,
  margin = { top: 4, right: 16, left: 8, bottom: 4 },
  yWidth = 120,
  children,
}) {
  const theme = useTheme();
  const computedHeight = height ?? Math.max(180, data.length * 36 + 20);
  return (
    <ResponsiveContainer width="100%" height={computedHeight}>
      <BarChart data={data} layout="vertical" margin={margin}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={theme.palette.divider} />
        <YAxis
          dataKey={yKey}
          type="category"
          tick={{ fontSize: 12, fill: theme.palette.text.primary }}
          width={yWidth}
          interval={0}
        />
        <XAxis type="number" tick={axisTick(theme)} allowDecimals={false} />
        <Tooltip contentStyle={tooltipContentStyle(theme)} cursor={{ fill: theme.palette.background.default }} />
        {children}
      </BarChart>
    </ResponsiveContainer>
  );
}

/**
 * Line chart frame for trends. Pass `<Line>` children for the series.
 */
export function LineChartFrame({
  data,
  xKey = 'date',
  height = 200,
  margin = { top: 4, right: 8, left: -20, bottom: 4 },
  children,
}) {
  const theme = useTheme();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={margin}>
        <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
        <XAxis dataKey={xKey} tick={axisTick(theme)} />
        <YAxis tick={axisTick(theme)} allowDecimals={false} />
        <Tooltip contentStyle={tooltipContentStyle(theme)} />
        {children}
      </LineChart>
    </ResponsiveContainer>
  );
}

/**
 * Pie chart frame. Pass `<Pie>` (with `<Cell>` children) for the series.
 */
export function PieChartFrame({ height = 200, children }) {
  const theme = useTheme();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        {children}
        <Tooltip contentStyle={tooltipContentStyle(theme)} />
      </PieChart>
    </ResponsiveContainer>
  );
}
