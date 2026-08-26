/*
  Carga mensual de universo Vicidial.
  Es idempotente y también se ejecuta automáticamente al iniciar una carga web.
*/
USE [MIS_Ardaby];
GO

IF COL_LENGTH('dbo.Control_Importacion_Vicidial_Leads', 'EntryMonth') IS NULL
    ALTER TABLE dbo.Control_Importacion_Vicidial_Leads ADD EntryMonth CHAR(7) NULL;
IF COL_LENGTH('dbo.Control_Importacion_Vicidial_Leads', 'TelefonosUnicos') IS NULL
    ALTER TABLE dbo.Control_Importacion_Vicidial_Leads ADD TelefonosUnicos BIGINT NULL;
IF COL_LENGTH('dbo.Control_Importacion_Vicidial_Leads', 'TelefonosNuevos') IS NULL
    ALTER TABLE dbo.Control_Importacion_Vicidial_Leads ADD TelefonosNuevos BIGINT NULL;
IF COL_LENGTH('dbo.Control_Importacion_Vicidial_Leads', 'TelefonosExistentes') IS NULL
    ALTER TABLE dbo.Control_Importacion_Vicidial_Leads ADD TelefonosExistentes BIGINT NULL;
IF COL_LENGTH('dbo.Control_Importacion_Vicidial_Leads', 'ExistentesMesAnterior') IS NULL
    ALTER TABLE dbo.Control_Importacion_Vicidial_Leads ADD ExistentesMesAnterior BIGINT NULL;
IF COL_LENGTH('dbo.Control_Importacion_Vicidial_Leads', 'MarcadosAntes') IS NULL
    ALTER TABLE dbo.Control_Importacion_Vicidial_Leads ADD MarcadosAntes BIGINT NULL;
IF COL_LENGTH('dbo.Control_Importacion_Vicidial_Leads', 'ExistentesMismoMes') IS NULL
    ALTER TABLE dbo.Control_Importacion_Vicidial_Leads ADD ExistentesMismoMes BIGINT NULL;
IF COL_LENGTH('dbo.Control_Importacion_Vicidial_Leads', 'FilasInvalidas') IS NULL
    ALTER TABLE dbo.Control_Importacion_Vicidial_Leads ADD FilasInvalidas BIGINT NULL;
IF COL_LENGTH('dbo.Control_Importacion_Vicidial_Leads', 'InteraccionesDuplicadas') IS NULL
    ALTER TABLE dbo.Control_Importacion_Vicidial_Leads ADD InteraccionesDuplicadas BIGINT NULL;
GO

IF OBJECT_ID('dbo.Vicidial_Lead_MonthlyCohort', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Vicidial_Lead_MonthlyCohort(
        CohortID BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        EntryMonth CHAR(7) NOT NULL,
        ListID NVARCHAR(100) NOT NULL
            CONSTRAINT DF_VicidialCohort_List DEFAULT '',
        PhoneNormalized VARCHAR(20) NOT NULL,
        LeadID BIGINT NULL,
        SourceFile NVARCHAR(260) NULL,
        FirstControlID BIGINT NULL,
        LastControlID BIGINT NULL,
        WasExistingBefore BIT NOT NULL
            CONSTRAINT DF_VicidialCohort_Existing DEFAULT 0,
        ExistedPriorMonth BIT NOT NULL
            CONSTRAINT DF_VicidialCohort_Prior DEFAULT 0,
        WasDialedBefore BIT NOT NULL
            CONSTRAINT DF_VicidialCohort_Dialed DEFAULT 0,
        FirstSeenAt DATETIME2(0) NOT NULL
            CONSTRAINT DF_VicidialCohort_FirstSeen DEFAULT SYSDATETIME(),
        LastSeenAt DATETIME2(0) NOT NULL
            CONSTRAINT DF_VicidialCohort_LastSeen DEFAULT SYSDATETIME()
    );

    CREATE UNIQUE INDEX UX_VicidialCohort_MonthListPhone
        ON dbo.Vicidial_Lead_MonthlyCohort(EntryMonth,ListID,PhoneNormalized);

    CREATE INDEX IX_VicidialCohort_PhoneMonth
        ON dbo.Vicidial_Lead_MonthlyCohort(PhoneNormalized,EntryMonth)
        INCLUDE (ListID,WasDialedBefore,ExistedPriorMonth);
END;
GO
