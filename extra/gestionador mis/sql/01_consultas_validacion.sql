USE [MIS_Ardaby];
GO

-- Ultimos registros importados
SELECT TOP (100)
    *
FROM dbo.Vicidial_Call_Report
ORDER BY ImportID DESC;
GO

-- Resumen de coincidencias contra el universo maestro
SELECT
    ExisteEnUniversoSQL,
    COUNT(*) AS Registros
FROM dbo.vw_Vicidial_Call_Report_Comparacion
GROUP BY ExisteEnUniversoSQL;
GO

-- Registros de Call Report sin LeadID localizado en el universo SQL
SELECT TOP (1000)
    *
FROM dbo.vw_Vicidial_Call_Report_Comparacion
WHERE ExisteEnUniversoSQL = 0
ORDER BY ImportID DESC;
GO
