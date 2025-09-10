import React, { useState, useEffect } from 'react';
import { generateDailySheet, getReportsList } from '../services/excelAPI';

const ExcelManager = ({ classId }) => {
  const [reports, setReports] = useState({ daily: [], monthly: [] });
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    loadReportsList();
  }, [classId]);

  const loadReportsList = async () => {
    try {
      const response = await getReportsList(classId);
      if (response.success) {
        setReports(response.reports);
      }
    } catch (error) {
      console.error('Failed to load reports list:', error);
    }
  };

  const handleGenerateDailySheet = async () => {
    setIsGenerating(true);
    try {
      const response = await generateDailySheet({
        classId,
        date: selectedDate
      });

      if (response.success) {
        alert('Daily attendance sheet generated successfully!');
        loadReportsList();
        window.open(response.excel.downloadUrl, '_blank');
      } else {
        alert('Failed to generate sheet: ' + response.message);
      }
    } catch (error) {
      alert('Error generating sheet: ' + error.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateMonthlyReport = async () => {
    const month = prompt('Enter month (1-12):');
    const year = prompt('Enter year (e.g., 2025):');
    
    if (month && year && month >= 1 && month <= 12) {
      setIsGenerating(true);
      try {
        const response = await fetch('/api/reports/generate-monthly', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            classId,
            month: parseInt(month),
            year: parseInt(year)
          })
        });

        const result = await response.json();
        
        if (result.success) {
          alert('Monthly report generated successfully!');
          loadReportsList();
          window.open(result.report.downloadUrl, '_blank');
        } else {
          alert('Failed to generate monthly report: ' + result.message);
        }
      } catch (error) {
        alert('Error generating monthly report: ' + error.message);
      } finally {
        setIsGenerating(false);
      }
    } else {
      alert('Please enter valid month (1-12) and year');
    }
  };

  return (
    <div className="excel-manager">
      <div className="excel-header">
        <h2>📊 Excel Attendance Management</h2>
        <p>Generate, download, and manage attendance Excel sheets</p>
      </div>

      <div className="generation-section">
        <div className="generation-cards">
          <div className="generation-card">
            <div className="card-header">
              <h3>📄 Daily Attendance Sheet</h3>
              <p>Generate Excel sheet for a specific date</p>
            </div>
            <div className="card-content">
              <div className="form-group">
                <label>Select Date:</label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  max={new Date().toISOString().split('T')[0]}
                />
              </div>
              <button
                onClick={handleGenerateDailySheet}
                disabled={isGenerating}
                className="generate-btn daily"
              >
                {isGenerating ? 'Generating...' : '📄 Generate Daily Sheet'}
              </button>
            </div>
          </div>

          <div className="generation-card">
            <div className="card-header">
              <h3>📈 Monthly Report</h3>
              <p>Generate comprehensive monthly attendance report</p>
            </div>
            <div className="card-content">
              <div className="monthly-info">
                <p>Includes:</p>
                <ul>
                  <li>✓ Day-wise attendance matrix</li>
                  <li>✓ Attendance percentages</li>
                  <li>✓ Statistical analysis</li>
                  <li>✓ Color-coded performance</li>
                </ul>
              </div>
              <button
                onClick={handleGenerateMonthlyReport}
                disabled={isGenerating}
                className="generate-btn monthly"
              >
                {isGenerating ? 'Generating...' : '📈 Generate Monthly Report'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="reports-section">
        <div className="reports-grid">
          <div className="reports-column">
            <h3>📄 Daily Attendance Sheets</h3>
            <div className="reports-list">
              {reports.daily.length > 0 ? (
                reports.daily.map((report, index) => (
                  <div key={index} className="report-item">
                    <div className="report-info">
                      <div className="report-date">{report.date}</div>
                      <div className="report-filename">{report.filename}</div>
                    </div>
                    <div className="report-actions">
                      <button
                        onClick={() => window.open(report.downloadUrl, '_blank')}
                        className="download-btn"
                      >
                        📥 Download
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="no-reports">
                  <p>No daily sheets generated yet</p>
                  <p>Generate your first daily sheet above</p>
                </div>
              )}
            </div>
          </div>

          <div className="reports-column">
            <h3>📈 Monthly Reports</h3>
            <div className="reports-list">
              {reports.monthly.length > 0 ? (
                reports.monthly.map((report, index) => (
                  <div key={index} className="report-item">
                    <div className="report-info">
                      <div className="report-date">{report.month}</div>
                      <div className="report-filename">{report.filename}</div>
                    </div>
                    <div className="report-actions">
                      <button
                        onClick={() => window.open(report.downloadUrl, '_blank')}
                        className="download-btn"
                      >
                        📥 Download
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="no-reports">
                  <p>No monthly reports generated yet</p>
                  <p>Generate your first monthly report above</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExcelManager;
