import { fetchModuleData } from './modelData.js';

let currentChart = null;
let currentManufacturer = null;
let currentModel = null;
let showPowerCurve = false;

const renderPVChart = async (manufacturer, model) => {
  // Input fields
  const irrInput = document.getElementById('irradiance-input');
  const tempInput = document.getElementById('temperature-input');
  const modsInput = document.getElementById('modules-input');
  const degInput = document.getElementById('degradation-input');
  const startDateInput = document.getElementById('start-date-input');
  const endDateInput = document.getElementById('end-date-input');

  let irradiance = parseFloat(irrInput.value);
  let temperature = parseFloat(tempInput.value);
  let modules = parseInt(modsInput.value);

  // Validate ranges
  if (irradiance < 0 || irradiance > 1500 || isNaN(irradiance)) {
    irradiance = 1000;
    irrInput.value = irradiance;
  }
  if (temperature < -20 || temperature > 100 || isNaN(temperature)) {
    temperature = 25;
    tempInput.value = temperature;
  }
  if (isNaN(modules) || modules < 1 || modules > 100) {
    modules = 1;
    modsInput.value = modules;
  }

  const degradationRate = parseFloat(degInput.value) / 100; // %
  const startDate = new Date(startDateInput.value);
  const endDate = new Date(endDateInput.value);
  const diffYears = (endDate - startDate) / (365.25 * 24 * 3600 * 1000);
  const totalDegradation = degradationRate * diffYears;
  const scalingFactor = Math.sqrt(1 - totalDegradation);

  const url = `/api/iv-curve/?manufacturer=${encodeURIComponent(manufacturer)}&model=${encodeURIComponent(model)}&temperature=${temperature}&irradiance=${irradiance}&modules=${modules}`;
  const res = await fetch(url);
  const data = await res.json();

  if (!data.voltage || !data.current) {
    console.warn('Invalid IV curve response:', data);
    return;
  }

  const ivData = data.voltage.map((v, i) => ({
    x: v * scalingFactor,
    y: data.current[i] * scalingFactor
  }));
  const powerData = data.voltage.map((v, i) => ({
    x: v * scalingFactor,
    y: data.power[i] * (1 - totalDegradation)
  }));

  const series = [{ name: 'IV Curve', data: ivData }];
  if (showPowerCurve) {
    series.push({
      name: 'Power Curve',
      data: powerData,
      yAxis: 1
    });
  }

  const yaxis = showPowerCurve
    ? [
        {
          min: 0,
          title: { text: 'Current (A)' },
          labels: { formatter: val => val.toFixed(2) }
        },
        {
          min: 0,
          opposite: true,
          title: { text: 'Power (W)' },
          labels: { formatter: val => val.toFixed(2) }
        }
      ]
    : {
        min: 0,
        title: { text: 'Current (A)' },
        labels: { formatter: val => val.toFixed(2) }
      };

  const options = {
    chart: { type: 'line', height: 420, toolbar: { show: false } },
    series: series,
    xaxis: {
      title: { text: 'Voltage (V)' },
      tickAmount: 10,
      labels: { rotate: -45, formatter: val => val.toFixed(2) }
    },
    yaxis: yaxis,
    tooltip: {
      y: { formatter: val => val.toFixed(2) },
      x: { formatter: val => val.toFixed(2) }
    }
  };

  const chartDiv = document.getElementById('pv-iv-chart');
  if (chartDiv) {
    if (window.currentChart) {
      window.currentChart.destroy();
    }
    window.currentChart = new ApexCharts(chartDiv, options);
    window.currentChart.render();
  }
};

const initPVChart = async () => {
  const modules = await fetchModuleData();
  console.log('Parsed Module Data:', modules);

  const makeSelect = document.getElementById('make-select');
  const modelSelect = document.getElementById('model-select');

  const uniqueManufacturers = [...new Set(modules.map(m => m.Manufacturer))];
  makeSelect.innerHTML =
    `<option value="">Select Manufacturer</option>` +
    uniqueManufacturers.map(m => `<option value="${m}">${m}</option>`).join('');

  makeSelect.addEventListener('change', () => {
    const selected = makeSelect.value;
    const models = modules
      .filter(m => m.Manufacturer === selected)
      .map(m => m.Model);

    modelSelect.innerHTML =
      `<option value="">Select Model</option>` +
      models.map(m => `<option value="${m}">${m}</option>`).join('');
  });

  modelSelect.addEventListener('change', () => {
    const manufacturer = makeSelect.value;
    const model = modelSelect.value;
    const selected = modules.find(
      m => m.Manufacturer === manufacturer && m.Model === model
    );
    if (selected) {
      currentManufacturer = manufacturer;
      currentModel = model;
      renderPVChart(manufacturer, model);
      updateModuleTable(selected);
    }
  });

  const today = new Date().toISOString().split('T')[0];
  document.getElementById('start-date-input').value = today;
  document.getElementById('end-date-input').value = today;

  ['irradiance-input', 'temperature-input', 'modules-input', 'degradation-input', 'start-date-input', 'end-date-input'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => {
      if (currentManufacturer && currentModel) {
        renderPVChart(currentManufacturer, currentModel);
      }
    });
  });
};

function updateModuleTable(module) {
  const tableBody = document.querySelector('#module-info-table tbody');
  tableBody.innerHTML = '';
  const rows = [
    ['Model', module.Model],
    ['Manufacturer', module.Manufacturer],
    ['Technology', module.Technology],
    ['Power (W)', module.STC],
    ['Voc (V)', module.V_oc_ref],
    ['Isc (A)', module.I_sc_ref],
    ['Vmp (V)', module.V_mp_ref],
    ['Imp (A)', module.I_mp_ref]
  ];
  rows.forEach(([label, value]) => {
    const row = `<tr><td>${label}</td><td>${value}</td></tr>`;
    tableBody.insertAdjacentHTML('beforeend', row);
  });
}

document.getElementById('toggle-power').addEventListener('click', () => {
  showPowerCurve = !showPowerCurve;
  if (currentManufacturer && currentModel) {
    renderPVChart(currentManufacturer, currentModel);
  }
});

document.getElementById('reset-stc').addEventListener('click', () => {
  document.getElementById('irradiance-input').value = 1000;
  document.getElementById('temperature-input').value = 25;
  document.getElementById('modules-input').value = 1;
  if (currentManufacturer && currentModel) {
    renderPVChart(currentManufacturer, currentModel);
  }
});

document.getElementById('reset-degradation').addEventListener('click', () => {
  document.getElementById('degradation-input').value = 0.5;
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('start-date-input').value = today;
  document.getElementById('end-date-input').value = today;
  if (currentManufacturer && currentModel) {
    renderPVChart(currentManufacturer, currentModel);
  }
});

// Modal logic for measured data
document.getElementById('open-user-data-modal').addEventListener('click', () => {
  document.getElementById('user-data-modal').classList.remove('hidden');
});
document.getElementById('close-user-data-modal').addEventListener('click', () => {
  document.getElementById('user-data-modal').classList.add('hidden');
});
document.getElementById('cancel-user-data').addEventListener('click', () => {
  document.getElementById('user-data-modal').classList.add('hidden');
});
document.getElementById('parse-user-data').addEventListener('click', () => {
  const text = document.getElementById('user-data-textarea').value.trim();
  const lines = text.split('\n').slice(0, 5000); // Limit to 5000 rows
  const tbody = document.querySelector('#user-data-table tbody');
  tbody.innerHTML = '';
  lines.forEach(line => {
    const parts = line.trim().split(/[\t\s]+/);
    if (parts.length >= 2) {
      const voltage = parseFloat(parts[0]);
      const current = parseFloat(parts[1]);
      if (!isNaN(voltage) && !isNaN(current)) {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td><input type="number" step="any" value="${voltage}" class="w-full p-1 border dark:bg-gray-700"></td>
          <td><input type="number" step="any" value="${current}" class="w-full p-1 border dark:bg-gray-700"></td>
        `;
        tbody.appendChild(row);
      }
    }
  });
});
document.getElementById('clear-user-data').addEventListener('click', () => {
  document.getElementById('user-data-textarea').value = '';
  document.querySelector('#user-data-table tbody').innerHTML = '';
});
document.getElementById('save-user-data').addEventListener('click', () => {
  const rows = document.querySelectorAll('#user-data-table tbody tr');
  const userData = [];
  rows.forEach(row => {
    const voltage = parseFloat(row.cells[0].querySelector('input').value);
    const current = parseFloat(row.cells[1].querySelector('input').value);
    if (!isNaN(voltage) && !isNaN(current)) {
      userData.push({ x: voltage, y: current });
    }
  });
    if (window.currentChart && userData.length) {
    let existingSeries = window.currentChart.w.config.series || [];

    // Remove existing "Measured Data" series
    existingSeries = existingSeries.filter(series => series.name !== 'Measured Data');

    const updatedSeries = [
        ...existingSeries,
        {
        name: 'Measured Data',
        data: userData,
        type: 'line',
        color: '#FF0000'
        }
    ];
    window.currentChart.updateOptions({
        series: updatedSeries
    });
    }
  document.getElementById('user-data-modal').classList.add('hidden');
});

document.addEventListener('DOMContentLoaded', initPVChart);
